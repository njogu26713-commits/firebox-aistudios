import { getStructuredCompletion } from "../aiProvider.js";
import { TOOL_ACTIVITY_LABELS } from "./toolContract.js";

const compact = (value) => JSON.stringify(value, (_key, item) => typeof item === "string" && item.length > 8000 ? `${item.slice(0, 8000)}…` : item);
const CHECK_TOOLS = new Set(["run_tests", "run_build"]);
const failedCheck = (value) => value?.ok === false || value?.success === false || value?.passed === false || Number(value?.exitCode) > 0 || Number(value?.statusCode) >= 400;

export async function runFireboxToolLoop({ config, messages, toolDefinitions, executeTool, emit = () => {}, signal, maxTokens = 2200, temperature = 0.2, maxTurns = 24, maxRepairAttempts = 3 }) {
  const transcript = [...messages];
  let repairAttempts = 0;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) throw new Error("Firebox Agent stopped");
    const response = await getStructuredCompletion({ config, messages: transcript, tools: toolDefinitions, maxTokens, temperature, signal });
    const message = response?.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    transcript.push({ role: "assistant", content: message.content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });

    if (!toolCalls.length) return { content: String(message.content || ""), messages: transcript, turns: turn + 1 };

    for (const call of toolCalls) {
      const name = call.function?.name;
      if (!name) continue;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { throw new Error(`Invalid arguments returned for Firebox tool ${name}`); }
      emit("tool-start", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, input: args, turn: turn + 1 });
      try {
        const result = await executeTool(name, args);
        const serialized = compact(result);
        emit("tool-complete", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, result: serialized, turn: turn + 1 });
        transcript.push({ role: "tool", tool_call_id: call.id, name, content: serialized });
        if (CHECK_TOOLS.has(name) && failedCheck(result)) {
          repairAttempts += 1;
          emit("workflow-repair", { tool: name, attempt: repairAttempts, maxAttempts: maxRepairAttempts, message: `${name} reported a project failure; diagnosing before the next check.` });
          if (repairAttempts > maxRepairAttempts) throw new Error(`${name} failed after ${maxRepairAttempts} repair attempts`);
          transcript.push({ role: "user", content: `The ${name} check failed. Diagnose the reported project error, use the available Firebox tools to inspect and repair the project, then run the check again. This is repair attempt ${repairAttempts} of ${maxRepairAttempts}.` });
        } else if (CHECK_TOOLS.has(name)) {
          emit("workflow-repair-complete", { tool: name, attempts: repairAttempts, message: "Project check passed after controlled repair handling." });
        }
      } catch (error) {
        emit("tool-error", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, message: error.message, turn: turn + 1 });
        transcript.push({ role: "tool", tool_call_id: call.id, name, content: compact({ error: error.message }) });
        if (CHECK_TOOLS.has(name)) {
          repairAttempts += 1;
          emit("workflow-repair", { tool: name, attempt: repairAttempts, maxAttempts: maxRepairAttempts, message: `${name} errored; diagnosing before the next check.` });
          if (repairAttempts > maxRepairAttempts) throw new Error(`${name} failed after ${maxRepairAttempts} repair attempts`);
          transcript.push({ role: "user", content: `The ${name} tool errored: ${error.message}. Diagnose and repair the project with Firebox tools, then run the check again. This is repair attempt ${repairAttempts} of ${maxRepairAttempts}.` });
        }
      }
    }
  }
  throw new Error(`Firebox Agent reached the ${maxTurns}-turn tool limit`);
}
