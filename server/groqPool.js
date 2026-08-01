/**
 * Groq API key pool — supports multiple keys for round-robin + rate-limit failover.
 *
 * Configuration (pick one):
 *   GROQ_API_KEYS=key1,key2,key3   ← comma-separated list of keys (preferred)
 *   GROQ_API_KEY=key1              ← single key (backward-compatible fallback)
 */
import Groq from "groq-sdk";

let _clients = null;   // lazy-initialised array of Groq instances
let _index   = 0;      // round-robin cursor

function loadClients() {
  if (_clients) return _clients;

  const keys = [];

  // Multi-key env var (comma-separated)
  const multi = process.env.GROQ_API_KEYS;
  if (multi) {
    for (const k of multi.split(",")) {
      const t = k.trim();
      if (t) keys.push(t);
    }
  }

  // Single-key fallback
  const single = process.env.GROQ_API_KEY;
  if (single?.trim() && !keys.includes(single.trim())) {
    keys.push(single.trim());
  }

  if (keys.length === 0) {
    throw new Error(
      "No Groq API key configured. Set GROQ_API_KEY or GROQ_API_KEYS in your environment."
    );
  }

  _clients = keys.map((apiKey, i) => {
    console.log(`[groqPool] Key ${i + 1}/${keys.length} loaded (${apiKey.slice(0, 8)}…)`);
    return new Groq({ apiKey });
  });

  console.log(`[groqPool] ${_clients.length} key(s) ready`);
  return _clients;
}

/**
 * Returns the next Groq client in round-robin order.
 */
export function nextClient() {
  const pool = loadClients();
  const client = pool[_index];
  _index = (_index + 1) % pool.length;
  return client;
}

/**
 * Calls fn(client) with automatic failover across all keys on rate-limit errors.
 * Non-rate-limit errors are thrown immediately.
 *
 * Works for both regular and streaming calls because the 429 always surfaces
 * during the initial `.create()` call, before any chunks arrive.
 *
 * @param {(client: Groq) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function callWithFallback(fn) {
  const pool = loadClients();
  const start = _index;

  for (let attempt = 0; attempt < pool.length; attempt++) {
    const slot   = (start + attempt) % pool.length;
    const client = pool[slot];

    try {
      const result = await fn(client);
      // Advance cursor past the winning slot so the next call starts fresh
      _index = (slot + 1) % pool.length;
      return result;
    } catch (err) {
      const isRateLimit =
        err?.status === 429 ||
        err?.error?.code === "rate_limit_exceeded" ||
        /rate.?limit/i.test(err?.message || "");

      if (isRateLimit && attempt < pool.length - 1) {
        console.warn(
          `[groqPool] Key ${slot + 1} rate-limited — falling back to key ${((slot + 1) % pool.length) + 1}`
        );
        continue;
      }
      throw err;
    }
  }
}

/** How many keys are in the pool. */
export function poolSize() {
  return loadClients().length;
}
