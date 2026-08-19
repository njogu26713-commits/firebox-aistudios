import { getStructuredCompletion } from "../aiProvider.js";
import { TOOL_ACTIVITY_LABELS } from "./toolContract.js";

const compact = (value) => JSON.stringify(value, (_key, item) => typeof item === "string" && item.length > 8000 ? `${item.slice(0, 8000)}…` : item);
const CHECK_TOOLS = new Set(["run_tests", "run_build"]);
const failedCheck = (value) => value?.ok === false || value?.success === false || value?.passed === false || Number(value?.exitCode) > 0 || Number(value?.statusCode) >= 400;

async function requestToolNarration({ config, toolName, args, signal }) {
  const target = args?.path || args?.file || args?.command || args?.package || toolName;
  const response = await getStructuredCompletion({
    config,
    messages: [
      { role:"system", content:"Write exactly one concise plain-text user-facing sentence describing the controlled Firebox action. Use first person, include the real target when available, and do not use Markdown, asterisks, bullets, or hidden reasoning." },
      { role:"user", content:`The next controlled Firebox action is ${toolName} targeting ${String(target)}. Write the status sentence now.` },
    ],
    tools: [],
    toolChoice: "none",
    maxTokens: 80,
    temperature: 0.2,
    signal,
  });
  const content = Array.isArray(response?.choices?.[0]?.message?.content)
    ? response.choices[0].message.content.map(part => typeof part === "string" ? part : part?.text || "").join("")
    : String(response?.choices?.[0]?.message?.content || "");
  return content.replace(/\s+/g, " ").replace(/\*{1,3}/g, "").trim();
}

export async function runFireboxToolLoop({ config, messages, toolDefinitions, executeTool, emit = () => {}, signal, maxTokens = 2200, temperature = 0.2, maxTurns = 24, maxRepairAttempts = 3 }) {
  const transcript = [...messages];
  let repairAttempts = 0;
  let toolCallRepairAttempts = 0;
  let emptyResponseRepairAttempts = 0;
  let repairNoticeSent = false;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (signal?.aborted) throw new Error("Firebox Agent stopped");
    let response;
    try {
      response = await getStructuredCompletion({
        config,
        messages: transcript,
        tools: toolDefinitions,
        toolChoice: config.provider && config.provider !== "cloud" && turn === 0 ? "required" : "auto",
        maxTokens,
        temperature,
        signal,
      });
    } catch (error) {
      const message = String(error?.message || "");
      const malformedToolCall = /tool.?use.?failed|parse tool call|invalid.*json|failed_generation/i.test(message);
      if (malformedToolCall && toolCallRepairAttempts < 2) {
        toolCallRepairAttempts += 1;
        if (!repairNoticeSent) {
          repairNoticeSent = true;
          emit("agent.message", { agent:"Firebox Agent", description:"The Agent is repairing its tool-call format before continuing.", status:"working", aiGenerated:true });
        }
        transcript.push({ role:"user", content:"Your previous tool-call output was invalid JSON and was not executed. Retry the next action using exactly one provided Firebox tool with strictly valid JSON arguments. Escape every newline inside string values and do not include markdown or source-code outside the tool arguments." });
        continue;
      }
      throw error;
    }
    const message = response?.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.slice(0, 1) : [];
    const content = Array.isArray(message.content)
      ? message.content.map((part) => typeof part === "string" ? part : part?.text || "").join("")
      : String(message.content || "");
    transcript.push({ role: "assistant", content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });

    if (!toolCalls.length) {
      if (content.trim()) return { content, messages: transcript, turns: turn + 1 };
      if (emptyResponseRepairAttempts < 2) {
        emptyResponseRepairAttempts += 1;
        if (!repairNoticeSent) {
          repairNoticeSent = true;
          emit("agent.message", { agent:"Firebox Agent", description:"The Agent returned no usable action and is retrying once before stopping.", status:"working", aiGenerated:true });
        }
        transcript.push({ role: "user", content: "Your previous response contained no assistant content and no Firebox tool call. Begin by using exactly one appropriate Firebox tool to inspect or modify the project, then continue the task." });
        continue;
      }
      throw new Error("Provider returned no assistant content or Firebox tool calls");
    }

    for (const call of toolCalls) {
      const name = call.function?.name;
      if (!name) continue;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { throw new Error(`Invalid arguments returned for Firebox tool ${name}`); }
      let progress = content.trim().replace(/\s+/g, " ");
      if (!progress) {
        try { progress = await requestToolNarration({ config, toolName:name, args, signal }); } catch { progress = ""; }
      }
      if (progress) emit("agent.message", { agent:"Firebox Agent", text:progress, description:progress, status:"working", aiGenerated:true, turn:turn + 1 });
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
