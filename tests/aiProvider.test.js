import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { testLocalAi } from "../server/aiProvider.js";

test("testLocalAi sends an OpenAI-compatible streaming request", async () => {
  let requestBody;
  const server = http.createServer(async (req, res) => {
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(req.method, "POST");
    let body = "";
    for await (const chunk of req) body += chunk;
    requestBody = JSON.parse(body);

    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Firebox Local AI connection OK" } }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const result = await testLocalAi({
      endpoint: `http://127.0.0.1:${port}/v1`,
      model: "test-model",
    });
    assert.equal(result.ok, true);
    assert.match(result.reply, /Firebox Local AI connection OK/);
    assert.equal(requestBody.model, "test-model");
    assert.equal(requestBody.stream, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
