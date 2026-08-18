import { getStructuredCompletion } from "../aiProvider.js";
import { TOOL_ACTIVITY_LABELS } from "./toolContract.js";

const compact = (value) => JSON.stringify(value, (_key, item) => typeof item === "string" && item.length > 8000 ? `${item.slice(0, 8000)}…` : item);

export async function runFireboxToolLoop({ config, messages, toolDefinitions, executeTool, emit = () => {}, signal, maxTokens = 2200, temperature = 0.2, maxTurns = 24 }) {
  const transcript = [...messages];
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
        emit("tool-complete", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, result: compact(result), turn: turn + 1 });
        transcript.push({ role: "tool", tool_call_id: call.id, name, content: compact(result) });
      } catch (error) {
        emit("tool-error", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, message: error.message, turn: turn + 1 });
        transcript.push({ role: "tool", tool_call_id: call.id, name, content: compact({ error: error.message }) });
      }
    }
  }
  throw new Error(`Firebox Agent reached the ${maxTurns}-turn tool limit`);
}
