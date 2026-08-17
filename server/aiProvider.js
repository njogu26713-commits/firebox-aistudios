import { callWithFallback } from "./groqPool.js";

const DEFAULT_CLOUD_MODEL = "llama-3.3-70b-versatile";

export function normalizeAiConfig(input = {}) {
  const provider = input.provider === "local" ? "local" : "cloud";

  if (provider === "cloud") return { provider: "cloud" };

  const endpoint = String(input.endpoint || "").trim().replace(/\/+$/, "");
  const model = String(input.model || "").trim();
  const apiKey = String(input.apiKey || "").trim();

  if (!endpoint) throw new Error("Local AI endpoint is required");
  if (!model) throw new Error("Local AI model identifier is required");

  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Local AI endpoint must be a valid http(s) URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Local AI endpoint must use http or https");
  }

  return { provider: "local", endpoint, model, apiKey };
}

function localCompletionUrl(endpoint) {
  return endpoint.endsWith("/chat/completions")
    ? endpoint
    : `${endpoint}/chat/completions`;
}

async function* streamLocalCompletion({ config, messages, maxTokens, temperature, signal }) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const response = await fetch(localCompletionUrl(config.endpoint), {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Local AI request failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
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
        let parsed;
        try { parsed = JSON.parse(payload); } catch { continue; }
        const token = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || "";
        if (token) yield token;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function getCompletionStream({ config, messages, maxTokens, temperature, signal }) {
  const normalized = normalizeAiConfig(config);
  if (normalized.provider === "local") {
    return streamLocalCompletion({ config: normalized, messages, maxTokens, temperature, signal });
  }

  return callWithFallback((client) => client.chat.completions.create({
    model: DEFAULT_CLOUD_MODEL,
    messages,
    stream: true,
    max_tokens: maxTokens,
    temperature,
    signal,
  }));
}

export async function testLocalAi(config, signal) {
  const normalized = normalizeAiConfig({ ...config, provider: "local" });
  const stream = await streamLocalCompletion({
    config: normalized,
    messages: [{ role: "user", content: "Reply with exactly: Firebox Local AI connection OK" }],
    maxTokens: 32,
    temperature: 0,
    signal,
  });

  let reply = "";
  for await (const token of stream) {
    reply += token;
    if (reply.length >= 300) break;
  }
  return { ok: true, reply: reply.trim() };
}
