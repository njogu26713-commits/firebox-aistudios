import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { testLocalAi, normalizeAiConfig, getStructuredCompletion } from "../server/aiProvider.js";

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


test("normalizes supported external providers with safe defaults", () => {
  assert.equal(normalizeAiConfig({ provider: "openai", apiKey: "key" }).model, "gpt-4o-mini");
  assert.equal(normalizeAiConfig({ provider: "anthropic", apiKey: "key" }).endpoint, "https://api.anthropic.com/v1");
  assert.throws(() => normalizeAiConfig({ provider: "google" }), /API key is required/);
});

test("OpenAI-compatible provider preserves Firebox tool calls", async () => {
  const originalFetch = global.fetch;
  let requestUrl;
  try {
    global.fetch = async (url, options) => {
      requestUrl = String(url);
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-test");
      assert.equal(body.tools[0].function.name, "read_file");
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", arguments: JSON.stringify({ path: "package.json" }), function: { name: "read_file", arguments: JSON.stringify({ path: "package.json" }) } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await getStructuredCompletion({
      config: { provider: "openai", endpoint: "https://example.test/v1", model: "gpt-test", apiKey: "key" },
      messages: [{ role: "user", content: "Inspect the project" }],
      tools: [{ type: "function", function: { name: "read_file", description: "Read a file", parameters: { type: "object", properties: {} } } }],
      maxTokens: 100,
      temperature: 0,
    });
    assert.equal(requestUrl, "https://example.test/v1/chat/completions");
    assert.equal(result.choices[0].message.tool_calls[0].function.name, "read_file");
  } finally {
    global.fetch = originalFetch;
  }
});


test("GPT-5-compatible providers use max_completion_tokens for tool calls", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.max_completion_tokens, 900);
      assert.equal(body.max_tokens, undefined);
      assert.equal(body.tools[0].function.name, "inspect_project");
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "done" } }] }), { status: 200 });
    };
    const result = await getStructuredCompletion({
      config: { provider: "openai", endpoint: "https://example.test/v1", model: "gpt-5", apiKey: "key" },
      messages: [{ role: "user", content: "Inspect" }],
      tools: [{ type: "function", function: { name: "inspect_project", description: "Inspect", parameters: { type: "object", properties: {} } } }],
      maxTokens: 900,
      temperature: 0,
    });
    assert.equal(result.choices[0].message.content, "done");
  } finally {
    global.fetch = originalFetch;
  }
});
