/**
 * `@ubean/ai/gateway` — Predefined OpenAI-compatible provider definitions.
 *
 * This module provides ready-to-use `ProviderDefinition` objects for popular
 * AI providers/gateways (DeepSeek, OpenRouter, OmniRoute, etc.). It does NOT
 * implement gateway-level functionality (routing/fallback/cost optimization) —
 * that is left to the external gateway (e.g., OmniRoute); this just wires the
 * already-running gateway into the ubean `@ubean/ai` system.
 *
 * Decision A: only provider presets, no gateway service.
 */
import type { ProviderDefinition } from './types';

/**
 * DeepSeek (https://www.deepseek.com/).
 * Default base URL is `https://api.deepseek.com/v1`.
 * Requires `DEEPSEEK_API_KEY` (or `UBEAN_AI_API_KEY`) env variable or manual `apiKey`.
 */
export const deepseek: ProviderDefinition = {
  id: 'deepseek',
  kind: 'openai-compatible',
  baseURL: 'https://api.deepseek.com/v1'
};

/**
 * OpenRouter (https://openrouter.ai/).
 * Base URL `https://openrouter.ai/api/v1`.
 * Requires `OPENROUTER_API_KEY`.
 */
export const openrouter: ProviderDefinition = {
  id: 'openrouter',
  kind: 'openai-compatible',
  baseURL: 'https://openrouter.ai/api/v1'
};

/**
 * OmniRoute (https://github.com/diegosouzapw/OmniRoute) — the Free AI Gateway.
 * This assumes you are running OmniRoute locally or have deployed it.
 * Default base URL is the default local endpoint `http://localhost:8080/v1`.
 * If you are running OmniRoute elsewhere, override `baseURL` when registering.
 */
export const omniRoute: ProviderDefinition = {
  id: 'omniroute',
  kind: 'openai-compatible',
  baseURL: 'http://localhost:8080/v1'
};

/**
 * OpenAI (https://platform.openai.com/).
 * Base URL `https://api.openai.com/v1`.
 * Requires `OPENAI_API_KEY`.
 *
 * Note: you can also use this provider via `@ai-sdk/openai` directly; this
 * definition is for when you are routing OpenAI through a proxy/gateway.
 */
export const openai: ProviderDefinition = {
  id: 'openai',
  kind: 'openai-compatible',
  baseURL: 'https://api.openai.com/v1'
};

/**
 * Anthropic via OpenAI-compatible endpoint.
 * Anthropic's native endpoint is not OpenAI-compatible out of the box, but
 * many gateways (including OmniRoute) expose it as such.
 */
export const anthropic: ProviderDefinition = {
  id: 'anthropic',
  kind: 'openai-compatible',
  baseURL: 'https://api.anthropic.com/v1'
};

/**
 * Google Gemini via OpenAI-compatible endpoint.
 * Gemini's native endpoint is not OpenAI-compatible out of the box; this
 * definition is for when you are using a gateway that exposes it as such.
 */
export const google: ProviderDefinition = {
  id: 'google',
  kind: 'openai-compatible',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai'
};

/**
 * Groq (https://groq.com/).
 * OpenAI-compatible endpoint out of the box.
 * Requires `GROQ_API_KEY`.
 */
export const groq: ProviderDefinition = {
  id: 'groq',
  kind: 'openai-compatible',
  baseURL: 'https://api.groq.com/openai/v1'
};

/** All built-in gateway providers exported from this module. */
export const allGatewayProviders: ProviderDefinition[] = [
  deepseek,
  openrouter,
  omniRoute,
  openai,
  anthropic,
  google,
  groq
];

// Re-export types for convenience.
export type { ProviderDefinition } from './types';
