import { getStructuredCompletion } from "../aiProvider.js";
import { TOOL_ACTIVITY_LABELS } from "./toolContract.js";

const compact = (value) => JSON.stringify(value, (_key, item) => typeof item === "string" && item.length > 8000 ? `${item.slice(0, 8000)}…` : item);
const CHECK_TOOLS = new Set(["run_tests", "run_build"]);
const BROWSER_CHECK_TOOLS = new Set(["browser_assert", "browser_console"]);
const VERIFICATION_TOOLS = new Set([...CHECK_TOOLS, ...BROWSER_CHECK_TOOLS]);
const failedCheck = (value) => value?.ok === false || value?.success === false || value?.passed === false || Number(value?.exitCode) > 0 || Number(value?.statusCode) >= 400;
const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));
const ACTION_RESULT_DELAY_MS = 2500;
const focusDelayFor = (toolName) => {
  if (["create_file", "write_file", "edit_file", "delete_file"].includes(toolName)) return 5000;
  if (["read_file", "search_project"].includes(toolName)) return 3500;
  if (["run_command", "run_tests", "run_build", "install_package"].includes(toolName)) return 4500;
  return 4000;
};

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
  let verificationCompleted = false;
  let verificationPromptAttempts = 0;
  let projectInspected = false;
  let pendingFileVerification = null;
  const fileMutations = new Set(["create_file", "write_file", "edit_file"]);
  turnLoop: for (let turn = 0; turn < maxTurns; turn += 1) {
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

    // Providers can occasionally choose a useful-looking action before obeying the
    // inspection-first instruction. Perform the required inspection as a controlled
    // recovery step, then ask the provider to choose its action again with the result.
    if (!projectInspected && toolCalls.length && toolCalls[0]?.function?.name !== "inspect_project") {
      transcript.pop();
      const inspectionCall = { id: `firebox-inspect-${turn}`, type: "function", function: { name: "inspect_project", arguments: "{}" } };
      emit("agent.message", { agent:"Firebox Agent", description:"I’m inspecting the existing project before continuing with the requested action.", status:"working", aiGenerated:true });
      transcript.push({ role: "assistant", content: null, tool_calls: [inspectionCall] });
      const inspectionResult = await executeTool("inspect_project", {});
      projectInspected = true;
      transcript.push({ role: "tool", tool_call_id: inspectionCall.id, name: "inspect_project", content: compact(inspectionResult) });
      transcript.push({ role: "user", content: "The required project inspection is complete. Continue with the original request and choose the next appropriate Firebox tool." });
      continue turnLoop;
    }

    if (!toolCalls.length) {
      if (content.trim() && !verificationCompleted) {
        verificationPromptAttempts += 1;
        if (verificationPromptAttempts <= 3) {
          emit("workflow-verification-required", { message: "The Agent must run a real project check before reporting completion.", status: "working" });
          transcript.push({ role: "user", content: "Do not finish yet. The implementation has not passed a real verification check. Use the available Firebox tools to run the most appropriate project test or build command, read its result, repair any reported errors, and repeat the check until it passes." });
          continue;
        }
        throw new Error("The Agent stopped before completing a successful project verification check");
      }
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
      if (name !== "inspect_project" && !projectInspected) {
        throw new Error("Professional workflow requires inspect_project before any other project action");
      }
      if (pendingFileVerification && !(name === "read_file" && args.path === pendingFileVerification)) {
        throw new Error(`Read and verify ${pendingFileVerification} before starting another file change`);
      }
      let progress = content.trim().replace(/\s+/g, " ");
      if (!progress) {
        try { progress = await requestToolNarration({ config, toolName:name, args, signal }); } catch { progress = ""; }
      }
      if (progress) emit("agent.message", { agent:"Firebox Agent", text:progress, description:progress, status:"working", aiGenerated:true, turn:turn + 1 });
      // Keep the active narration visible long enough for the user to understand which single action is in focus.
      await sleep(focusDelayFor(name));
      emit("tool-start", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, input: args, turn: turn + 1 });
      try {
        const result = await executeTool(name, args);
        if (name === "inspect_project") projectInspected = true;
        if (name === "read_file" && args.path === pendingFileVerification) pendingFileVerification = null;
        if (fileMutations.has(name)) pendingFileVerification = args.path;
        const serialized = compact(result);
        // Do not immediately jump to the next action. Let the completed result remain observable before asking the model to continue.
        await sleep(ACTION_RESULT_DELAY_MS);
        emit("tool-complete", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, result: serialized, turn: turn + 1 });
        transcript.push({ role: "tool", tool_call_id: call.id, name, content: serialized });
        if (!VERIFICATION_TOOLS.has(name)) verificationCompleted = false;
        transcript.push({ role:"user", content:"The previous controlled Firebox action has completed. Read and use its result before continuing. In your next response, first confirm that result in one concise plain-text sentence, then state the next file or action you are starting, and make only one next controlled tool call. For every created, written, or edited file, the next controlled action must be read_file on that exact path so the complete file can be checked before any other file is changed. Never batch file changes or claim a file is complete before its read-back result confirms it." });
        const browserFailed = BROWSER_CHECK_TOOLS.has(name) && (failedCheck(result) || result?.consoleErrors?.length || result?.pageErrors?.length);
        if ((CHECK_TOOLS.has(name) && failedCheck(result)) || browserFailed) {
          repairAttempts += 1;
          emit("workflow-repair", { tool: name, attempt: repairAttempts, maxAttempts: maxRepairAttempts, message: `${name} reported a project failure; diagnosing before the next check.` });
          if (repairAttempts > maxRepairAttempts) throw new Error(`${name} failed after ${maxRepairAttempts} repair attempts`);
          transcript.push({ role: "user", content: `The ${name} check failed. Diagnose the reported project error, use the available Firebox tools to inspect and repair the project, then run the check again. This is repair attempt ${repairAttempts} of ${maxRepairAttempts}.` });
        } else if (VERIFICATION_TOOLS.has(name)) {
          verificationCompleted = true;
          emit("workflow-repair-complete", { tool: name, attempts: repairAttempts, message: "Project check passed after controlled repair handling." });
        }
      } catch (error) {
        emit("tool-error", { tool: name, label: TOOL_ACTIVITY_LABELS[name] || name, message: error.message, turn: turn + 1 });
        transcript.push({ role: "tool", tool_call_id: call.id, name, content: compact({ error: error.message }) });
        if (VERIFICATION_TOOLS.has(name)) {
          verificationCompleted = false;
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
