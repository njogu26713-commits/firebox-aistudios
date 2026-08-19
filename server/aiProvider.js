import { callWithFallback } from "./groqPool.js";

const DEFAULT_CLOUD_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const PROVIDER_DEFAULTS = {
  openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { endpoint: "https://api.anthropic.com/v1", model: "claude-3-5-haiku-latest" },
  google: { endpoint: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" },
  openrouter: { endpoint: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  custom: { endpoint: "", model: "" },
};
const SUPPORTED_EXTERNAL = new Set(Object.keys(PROVIDER_DEFAULTS));

export function normalizeAiConfig(input = {}) {
  const provider = String(input.provider || "cloud").toLowerCase();
  if (provider === "cloud") return { provider: "cloud" };
  if (provider === "local" || SUPPORTED_EXTERNAL.has(provider)) {
    const defaults = provider === "local" ? {} : PROVIDER_DEFAULTS[provider];
    let endpoint = String(input.endpoint || defaults.endpoint || "").trim().replace(/\/+$/, "");
    if (provider === "openai" || provider === "openrouter" || provider === "custom") endpoint = endpoint.replace(/\/chat\/completions$/i, "");
    if (provider === "anthropic") endpoint = endpoint.replace(/\/messages$/i, "");
    const model = String(input.model || defaults.model || "").trim();
    const apiKey = String(input.apiKey || "").trim();
    if (!endpoint) throw new Error(`${provider === "local" ? "Local AI" : provider} endpoint is required`);
    if (!model) throw new Error(`${provider === "local" ? "Local AI" : provider} model identifier is required`);
    let parsed;
    try { parsed = new URL(endpoint); } catch { throw new Error("AI endpoint must be a valid http(s) URL"); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("AI endpoint must use http or https");
    if (!['local', 'custom'].includes(provider) && !apiKey) throw new Error(`${provider} API key is required`);
    return { provider, endpoint, model, apiKey };
  }
  throw new Error(`Unsupported AI provider: ${provider}`);
}

function localCompletionUrl(endpoint) {
  return endpoint.endsWith("/chat/completions") ? endpoint : `${endpoint}/chat/completions`;
}

async function fetchProvider(url, options, label) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(`${label} connection failed at ${url}: ${error?.message || "fetch failed"}`);
  }
}

function normalizeProviderError(label, status, body = "") {
  const text = String(body || "");
  if (status === 402 || /insufficient\s+credits|out\s+of\s+credits|never\s+purchased\s+credits|credit(?:s)?\s+(?:limit|balance)/i.test(text)) {
    return new Error(`Your ${label} AI provider is out of credits. Try another configured Agent or add credits to the provider account.`);
  }
  return new Error(`${label} request failed (${status})${text ? `: ${text.slice(0, 500)}` : ""}`);
}

async function readJson(response, label) {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw normalizeProviderError(label, response.status, body);
  }
  return response.json();
}

async function* streamLocalCompletion({ config, messages, maxTokens, temperature, signal }) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const localUrl = localCompletionUrl(config.endpoint);
  const response = await fetchProvider(localUrl, { method: "POST", headers, signal, body: JSON.stringify({ model: config.model, messages, think: false, stream: true, max_tokens: maxTokens, temperature }) }, "Local AI");
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw normalizeProviderError("Local AI", response.status, body);
  }
  if (!response.body) throw new Error("Local AI returned an empty response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        const line = event.split("\n").find((entry) => entry.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let parsed; try { parsed = JSON.parse(payload); } catch { continue; }
        const token = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || "";
        if (token) yield token;
      }
    }
  } finally { reader.releaseLock(); }
}

function openAiHeaders(config) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` };
}

function toAnthropicMessages(messages) {
  return messages.filter((message) => message.role !== "system").map((message) => {
    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      return { role: "assistant", content: message.tool_calls.map((call) => ({ type: "tool_use", id: call.id, name: call.function?.name, input: JSON.parse(call.function?.arguments || "{}") })) };
    }
    if (message.role === "tool") {
      return { role: "user", content: [{ type: "tool_result", tool_use_id: message.tool_call_id, content: String(message.content || "") }] };
    }
    return { role: message.role === "assistant" ? "assistant" : "user", content: message.content || "" };
  });
}

function fromAnthropic(data) {
  const content = (data.content || []).filter((part) => part.type === "text").map((part) => part.text).join("");
  const toolCalls = (data.content || []).filter((part) => part.type === "tool_use").map((part) => ({ id: part.id, type: "function", function: { name: part.name, arguments: JSON.stringify(part.input || {}) } }));
  return { choices: [{ message: { role: "assistant", content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) } }] };
}

function toGeminiContents(messages) {
  const contents = [];
  for (const message of messages.filter((item) => item.role !== "system")) {
    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      contents.push({ role: "model", parts: message.tool_calls.map((call) => ({ functionCall: { name: call.function?.name, args: JSON.parse(call.function?.arguments || "{}") } })) });
    } else if (message.role === "tool") {
      contents.push({ role: "user", parts: [{ functionResponse: { name: message.name || "firebox_tool", response: { content: String(message.content || "") } } }] });
    } else {
      contents.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: String(message.content || "") }] });
    }
  }
  return contents;
}

function fromGemini(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((part) => part.text).map((part) => part.text).join("");
  const toolCalls = parts.filter((part) => part.functionCall).map((part, index) => ({ id: `gemini-call-${index}`, type: "function", function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) } }));
  return { choices: [{ message: { role: "assistant", content: text, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) } }] };
}

async function providerCompletion({ config, messages, tools = [], toolChoice = "auto", maxTokens, temperature, signal }) {
  const tokenField = /^gpt-5(?:[.-]|$)/i.test(config.model || "") ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens };
  if (config.provider === "openai" || config.provider === "openrouter" || config.provider === "custom") {
    const providerUrl = `${config.endpoint}/chat/completions`;
    const response = await fetchProvider(providerUrl, { method: "POST", headers: openAiHeaders(config), signal, body: JSON.stringify({ model: config.model, messages, tools, tool_choice: tools.length ? toolChoice : "none", stream: false, ...tokenField, temperature }) }, config.provider);
    return readJson(response, config.provider);
  }
  if (config.provider === "anthropic") {
    const system = messages.find((message) => message.role === "system")?.content;
    const providerUrl = `${config.endpoint}/messages`;
    const response = await fetchProvider(providerUrl, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }, signal, body: JSON.stringify({ model: config.model, system, messages: toAnthropicMessages(messages), tools: tools.map((tool) => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters })), tool_choice: tools.length ? (toolChoice === "required" ? { type: "any" } : { type: "auto" }) : undefined, max_tokens: maxTokens || 1024, temperature }) }, "anthropic");
    return fromAnthropic(await readJson(response, "anthropic"));
  }
  const url = `${config.endpoint}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetchProvider(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ contents: toGeminiContents(messages), tools: tools.length ? [{ functionDeclarations: tools.map((tool) => ({ name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters })) }] : undefined, toolConfig: tools.length && toolChoice === "required" ? { functionCallingConfig: { mode: "ANY" } } : undefined, generationConfig: { maxOutputTokens: maxTokens, temperature } }) }, "google");
  return fromGemini(await readJson(response, "google"));
}

export async function getStructuredCompletion({ config, messages, tools = [], toolChoice = "auto", maxTokens, temperature, signal }) {
  const normalized = normalizeAiConfig(config);
  if (normalized.provider === "local") {
    const headers = { "Content-Type": "application/json" };
    if (normalized.apiKey) headers.Authorization = `Bearer ${normalized.apiKey}`;
    const localUrl = localCompletionUrl(normalized.endpoint);
    const response = await fetchProvider(localUrl, { method: "POST", headers, signal, body: JSON.stringify({ model: normalized.model, messages, tools, tool_choice: tools.length ? toolChoice : "none", think: false, stream: false, max_tokens: maxTokens, temperature }) }, "Local AI");
    return readJson(response, "Local AI");
  }
  if (normalized.provider !== "cloud") return providerCompletion({ config: normalized, messages, tools, toolChoice, maxTokens, temperature, signal });
  return callWithFallback((client) => client.chat.completions.create({ model: DEFAULT_CLOUD_MODEL, messages, tools, tool_choice: tools.length ? toolChoice : "none", stream: false, max_tokens: maxTokens, temperature }));
}

export async function getCompletionStream({ config, messages, maxTokens, temperature, signal }) {
  const normalized = normalizeAiConfig(config);
  if (normalized.provider === "local") return streamLocalCompletion({ config: normalized, messages, maxTokens, temperature, signal });
  if (normalized.provider !== "cloud") {
    const response = await providerCompletion({ config: normalized, messages, maxTokens, temperature, signal });
    return (async function* () { const content = response.choices?.[0]?.message?.content || ""; if (content) yield content; })();
  }
  return callWithFallback((client) => client.chat.completions.create({ model: DEFAULT_CLOUD_MODEL, messages, stream: true, max_tokens: maxTokens, temperature }));
}

export async function testLocalAi(config, signal) {
  const normalized = normalizeAiConfig({ ...config, provider: "local" });
  const stream = await streamLocalCompletion({ config: normalized, messages: [{ role: "user", content: "Reply with exactly: Firebox Local AI connection OK" }], maxTokens: 32, temperature: 0, signal });
  let reply = "";
  for await (const token of stream) { reply += token; if (reply.length >= 300) break; }
  return { ok: true, reply: reply.trim() };
}

export { PROVIDER_DEFAULTS };
