import Build from "../models/Build.js";
import { AGENT_DEFS } from "./config.js";
import { extractFiles } from "../utils/fileParser.js";
import { getCompletionStream, normalizeAiConfig } from "../aiProvider.js";
import { FIREBOX_TOOL_DEFINITIONS } from "./toolContract.js";
import { runFireboxToolLoop } from "./toolLoop.js";
import { createCloudProjectTools } from "./cloudTools.js";
import { AGENT_CAPABILITIES, MAX_REPAIR_ATTEMPTS } from "./workflow.js";

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForResume(buildId, res, signal) {
  let announced = false;
  while (!signal?.aborted) {
    const state = await Build.findById(buildId).select("status executionState").lean();
    if (!state || state.status !== "running" || state.executionState !== "paused") {
      if (announced) sse(res, "workflow-resumed", { buildId: buildId.toString() });
      return state;
    }
    if (!announced) {
      sse(res, "workflow-paused", { buildId: buildId.toString(), message: "Paused at a safe workflow checkpoint" });
      announced = true;
    }
    await sleep(500);
  }
  return null;
}

async function runProviderToolMode(build, res, aiConfig, signal) {
  const emit = (event, data) => sse(res, event, { ...data, agent: "Firebox Agent" });
  const tools = createCloudProjectTools({ build, emit });
  emit("agent.started", { agent:"Firebox Agent", title:"Firebox Agent", description:"Starting autonomous project work", status:"working" });
  emit("task.started", { agent:"Firebox Agent", title:"Active task", description:build.description, status:"working" });
  emit("workflow-stage-start", { stage: "autonomous", label: "Firebox Agent", activity: "Choosing the next controlled project action" });
  const result = await runFireboxToolLoop({
    config: aiConfig,
    messages: [
      { role: "system", content: "You are the Firebox Agent. Use only the provided Firebox tools. Inspect the current project before major edits, preserve its architecture, use tool results to decide what to do next, and verify changes before preview. Before every tool call, write exactly one concise user-facing progress sentence describing the action you are about to perform, including the real file path or command when known, such as \"I’m writing code for src/App.jsx.\" or \"I’m running npm run build.\" This is a status update, not hidden reasoning. Never invent completed work and never output source-code fences instead of using tools." },
      { role: "user", content: build.description },
    ],
    toolDefinitions: FIREBOX_TOOL_DEFINITIONS,
    signal,
    emit,
    executeTool: (name, args) => {
      if (!tools[name]) throw new Error(`Firebox tool is not available: ${name}`);
      if (name === "run_command") return tools[name](args.command, args.args || []);
      if (["read_file", "search_project", "create_file", "write_file", "delete_file", "edit_file", "install_package"].includes(name)) return tools[name](...(name === "edit_file" ? [args.path, args.search, args.replacement] : name === "create_file" || name === "write_file" ? [args.path, args.content] : name === "install_package" ? [args.package] : name === "read_file" || name === "delete_file" ? [args.path] : [args.term]));
      return tools[name]();
    },
  });
  await Build.findByIdAndUpdate(build._id, { $set: { status: "complete" } });
  emit("checkpoint.created", { agent:"Firebox Agent", title:"Checkpoint created", description:"Project changes persisted", status:"completed", timestamp:Date.now() });
  emit("agent.completed", { agent:"Firebox Agent", title:"Completed", description:"Project work finished", status:"completed" });
  emit("agent-complete", { output: result.content });
  emit("workflow-stage-complete", { stage: "autonomous", label: "Firebox Agent" });
  sse(res, "build-complete", { buildId: build._id.toString() });
}

async function getStreamWithRepair({ config, messages, maxTokens, temperature, signal, res, agent }) {
  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      return await getCompletionStream({ config, messages, maxTokens, temperature, signal });
    } catch (error) {
      if (attempt >= MAX_REPAIR_ATTEMPTS) throw error;
      sse(res, "workflow-repair", { agent, attempt, maxAttempts: MAX_REPAIR_ATTEMPTS, message: error.message });
    }
  }
  throw new Error("Provider retry limit reached");
}

export async function runAgentPipeline(build, res, signal) {
  const agentOutputs = {};
  const aiConfig = normalizeAiConfig({
    provider: build.provider || "cloud",
    ...(build.localAi?.toObject?.() || build.localAi || {}),
  });

  if (build.toolMode) {
    try {
      await runProviderToolMode(build, res, aiConfig, signal);
    } catch (error) {
      await Build.findByIdAndUpdate(build._id, { $set: { status: "failed" } });
      sse(res, "agent.failed", { agent:"Firebox Agent", title:"Agent failed", description:error.message, status:"error", details:error.stack || error.message });
      sse(res, "agent-error", { agent: "Firebox Agent", message: error.message });
    }
    return;
  }

  for (let i = 0; i < AGENT_DEFS.length; i++) {
    if (signal?.aborted) break;
    const beforeStage = await waitForResume(build._id, res, signal);
    if (!beforeStage || signal?.aborted) break;

    const agentDef = AGENT_DEFS[i];
    const capability = AGENT_CAPABILITIES[agentDef.name] || { id: agentDef.name.toLowerCase(), label: agentDef.task, activity: agentDef.task };
    sse(res, "agent.started", { agent:agentDef.name, title:capability.label, description:capability.activity, status:"working" });
    sse(res, "task.started", { agent:agentDef.name, title:capability.label, description:capability.activity, status:"working" });
    sse(res, "workflow-stage-start", { stage: capability.id, label: capability.label, activity: capability.activity, agent: agentDef.name });

    await Build.findOneAndUpdate(
      { _id: build._id, "agents.name": agentDef.name },
      { $set: { "agents.$.status": "working", "agents.$.startedAt": new Date() } }
    );

    sse(res, "agent-start", { agent: agentDef.name, task: agentDef.task, capability });

    // Build context from description + all prior agent outputs
    const contextLines = [`## App Description\n${build.description}`];
    for (const [name, output] of Object.entries(agentOutputs)) {
      contextLines.push(`\n## ${name} Agent Output\n${output}`);
    }

    try {
      const stream = await getStreamWithRepair({
        config: aiConfig,
        messages: [
          { role: "system", content: agentDef.systemPrompt },
          { role: "user",   content: contextLines.join("\n\n") },
        ],
        maxTokens: 4000,
        temperature: 0.2,
        signal,
      });

      let fullOutput = "";
      let buffer = "";

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const token = typeof chunk === "string"
          ? chunk
          : chunk.choices?.[0]?.delta?.content || "";
        if (!token) continue;
        fullOutput += token;
        buffer    += token;
        if (buffer.length >= 30) {
          sse(res, "agent-token", { agent: agentDef.name, token: buffer });
          buffer = "";
        }
      }
      if (buffer) sse(res, "agent-token", { agent: agentDef.name, token: buffer });
      const afterGeneration = await waitForResume(build._id, res, signal);
      if (!afterGeneration || signal?.aborted) break;

      agentOutputs[agentDef.name] = fullOutput;

      // Extract named files from the output
      const files = extractFiles(agentDef.name, fullOutput);

      // Persist agent result + files
      await Build.findOneAndUpdate(
        { _id: build._id, "agents.name": agentDef.name },
        {
          $set: {
            "agents.$.status":      "done",
            "agents.$.output":      fullOutput,
            "agents.$.completedAt": new Date(),
          },
        }
      );

      if (files.length > 0) {
        sse(res, "tool-start", { tool: "create_or_update_files", agent: agentDef.name, count: files.length });
        await Build.findByIdAndUpdate(build._id, { $push: { files: { $each: files } } });
        sse(res, "tool-complete", { tool: "create_or_update_files", agent: agentDef.name, count: files.length });
      }

      sse(res, "agent.completed", { agent:agentDef.name, title:capability.label, description:`${agentDef.name} completed`, status:"completed", files:files.map(file => file.path) });
      sse(res, "agent-complete", { agent: agentDef.name, output: fullOutput, files, capability });
      sse(res, "workflow-stage-complete", { stage: capability.id, label: capability.label, agent: agentDef.name });

    } catch (err) {
      console.error(`Agent ${agentDef.name} error:`, err.message);
      await Build.findOneAndUpdate(
        { _id: build._id, "agents.name": agentDef.name },
        { $set: { "agents.$.status": "error" } }
      );
      sse(res, "agent.failed", { agent:agentDef.name, title:capability.label, description:err.message, status:"error", details:err.stack || err.message });
      sse(res, "agent-error", { agent: agentDef.name, message: err.message, capability });
      sse(res, "workflow-stage-error", { stage: capability.id, label: capability.label, agent: agentDef.name, message: err.message });
      await Build.findByIdAndUpdate(build._id, { $set: { status: "failed" } });
      return;
    }
  }

  if (!signal?.aborted) {
    await Build.findByIdAndUpdate(build._id, { $set: { status: "complete" } });
    sse(res, "checkpoint.created", { agent:"Firebox Agent", title:"Checkpoint created", description:"Project changes persisted", status:"completed", timestamp:Date.now() });
    sse(res, "agent.completed", { agent:"Firebox Agent", title:"Completed", description:"Project is ready", status:"completed" });
    sse(res, "build-complete", { buildId: build._id.toString() });
  }
}
