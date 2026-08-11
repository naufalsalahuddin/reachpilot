"use strict";
/**
 * One chat() interface over Anthropic (Claude), OpenAI (ChatGPT) and Groq, with
 * per-provider API-key rotation (see keystore). Groq reuses the OpenAI SDK with a
 * different baseURL. Keys come from the UI-managed pool, falling back to .env.
 */
const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");
const config = require("../../config");
const keystore = require("../keystore");

const PROVIDERS = ["anthropic", "openai", "groq"];

async function isAvailable(provider) {
  if (!PROVIDERS.includes(provider)) return false;
  return keystore.hasKey(provider);
}

async function availableProviders() {
  return keystore.availableAiProviders();
}

async function callOnce(provider, key, { system, prompt, maxTokens, temperature, model }) {
  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: model || config.ai.anthropic.model,
      max_tokens: maxTokens, temperature,
      system: system || undefined,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  }
  const opts = provider === "groq"
    ? { apiKey: key, baseURL: config.ai.groq.baseURL }
    : { apiKey: key };
  const client = new OpenAI(opts);
  const chosenModel = model || (provider === "groq" ? config.ai.groq.model : config.ai.openai.model);
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });
  const res = await client.chat.completions.create({ model: chosenModel, max_tokens: maxTokens, temperature, messages });
  return (res.choices?.[0]?.message?.content || "").trim();
}

/** Single-turn chat completion, with automatic key rotation on rate limits. */
async function chat({ provider, system, prompt, maxTokens = 700, temperature = 0.7, model }) {
  if (!PROVIDERS.includes(provider)) throw new Error(`Unknown provider "${provider}"`);
  return keystore.withKey(provider, (key) =>
    callOnce(provider, key, { system, prompt, maxTokens, temperature, model })
  );
}

module.exports = { chat, isAvailable, availableProviders, PROVIDERS };
