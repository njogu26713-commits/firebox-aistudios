import Build from "../models/Build.js";
import { AGENT_DEFS } from "./config.js";
import { extractFiles } from "../utils/fileParser.js";
import { getCompletionStream, normalizeAiConfig } from "../aiProvider.js";
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

  for (let i = 0; i < AGENT_DEFS.length; i++) {
    if (signal?.aborted) break;
    const beforeStage = await waitForResume(build._id, res, signal);
    if (!beforeStage || signal?.aborted) break;

    const agentDef = AGENT_DEFS[i];
    const capability = AGENT_CAPABILITIES[agentDef.name] || { id: agentDef.name.toLowerCase(), label: agentDef.task, activity: agentDef.task };
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

      sse(res, "agent-complete", { agent: agentDef.name, output: fullOutput, files, capability });
      sse(res, "workflow-stage-complete", { stage: capability.id, label: capability.label, agent: agentDef.name });

    } catch (err) {
      console.error(`Agent ${agentDef.name} error:`, err.message);
      await Build.findOneAndUpdate(
        { _id: build._id, "agents.name": agentDef.name },
        { $set: { "agents.$.status": "error" } }
      );
      sse(res, "agent-error", { agent: agentDef.name, message: err.message, capability });
      sse(res, "workflow-stage-error", { stage: capability.id, label: capability.label, agent: agentDef.name, message: err.message });
      await Build.findByIdAndUpdate(build._id, { $set: { status: "failed" } });
      return;
    }
  }

  if (!signal?.aborted) {
    await Build.findByIdAndUpdate(build._id, { $set: { status: "complete" } });
    sse(res, "build-complete", { buildId: build._id.toString() });
  }
}
