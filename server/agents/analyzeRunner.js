import Build from "../models/Build.js";
import { ANALYZE_AGENT_DEFS } from "./analyzeConfig.js";
import { extractFiles } from "../utils/fileParser.js";
import { callWithFallback } from "../groqPool.js";

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Run the repo analysis pipeline.
 * @param {object} build   — Mongoose Build document
 * @param {string} repoContext — string containing fetched repo file contents
 * @param {object} res     — Express response (SSE)
 * @param {AbortSignal} signal
 */
export async function runAnalysisPipeline(build, repoContext, res, signal) {
  const agentOutputs = {};

  for (let i = 0; i < ANALYZE_AGENT_DEFS.length; i++) {
    if (signal?.aborted) break;

    const agentDef = ANALYZE_AGENT_DEFS[i];

    await Build.findOneAndUpdate(
      { _id: build._id, "agents.name": agentDef.name },
      { $set: { "agents.$.status": "working", "agents.$.startedAt": new Date() } }
    );

    sse(res, "agent-start", { agent: agentDef.name, task: agentDef.task });

    // Build context: repo files + prior agent outputs
    const contextLines = [`## Repository Context\n${repoContext}`];
    for (const [name, output] of Object.entries(agentOutputs)) {
      contextLines.push(`\n## ${name} Agent Analysis\n${output}`);
    }

    try {
      const stream = await callWithFallback(client =>
        client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: agentDef.systemPrompt },
            { role: "user",   content: contextLines.join("\n\n") },
          ],
          stream: true,
          max_tokens: 2000,
          temperature: 0.3,
        })
      );

      let fullOutput = "";
      let buffer = "";

      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const token = chunk.choices[0]?.delta?.content || "";
        if (!token) continue;
        fullOutput += token;
        buffer    += token;
        if (buffer.length >= 30) {
          sse(res, "agent-token", { agent: agentDef.name, token: buffer });
          buffer = "";
        }
      }
      if (buffer) sse(res, "agent-token", { agent: agentDef.name, token: buffer });

      agentOutputs[agentDef.name] = fullOutput;

      const files = extractFiles(agentDef.name, fullOutput);

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
        await Build.findByIdAndUpdate(build._id, { $push: { files: { $each: files } } });
      }

      sse(res, "agent-complete", { agent: agentDef.name, output: fullOutput, files });

    } catch (err) {
      console.error(`Analyze agent ${agentDef.name} error:`, err.message);
      await Build.findOneAndUpdate(
        { _id: build._id, "agents.name": agentDef.name },
        { $set: { "agents.$.status": "error" } }
      );
      sse(res, "agent-error", { agent: agentDef.name, message: err.message });
      await Build.findByIdAndUpdate(build._id, { $set: { status: "failed" } });
      return;
    }
  }

  if (!signal?.aborted) {
    await Build.findByIdAndUpdate(build._id, { $set: { status: "complete" } });
    sse(res, "build-complete", { buildId: build._id.toString() });
  }
}
