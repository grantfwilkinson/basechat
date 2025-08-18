import { z } from "zod";

// Single source of truth for providers and their models
export const PROVIDER_CONFIG = {
  openai: {
    models: [] as const,
    logo: "/openai.svg",
    modelLogos: {
      "gpt-4o": "/openai.svg",
      "gpt-3.5-turbo": "/openai.svg",
      "gpt-4.1-2025-04-14": "/openai.svg",
      "o3-2025-04-16": "/openai.svg",
    } as const,
    displayNames: {
      "gpt-4o": "GPT-4o",
      "gpt-3.5-turbo": "GPT-3.5 Turbo",
      "gpt-4.1-2025-04-14": "GPT-4.1",
      "o3-2025-04-16": "o3",
    } as const,
  },
  google: {
    models: [] as const,
    logo: "/gemini.svg",
    modelLogos: {
      "gemini-2.0-flash": "/gemini.svg",
      "gemini-1.5-pro": "/gemini.svg",
    } as const,
    displayNames: {
      "gemini-2.0-flash": "Gemini 2.0 Flash",
      "gemini-1.5-pro": "Gemini 1.5 Pro",
    } as const,
  },
  anthropic: {
    models: ["claude-sonnet-4-20250514"] as const,
    logo: "/anthropic.svg",
    modelLogos: {
      "claude-3-7-sonnet-latest": "/anthropic.svg",
      "claude-3-5-haiku-latest": "/anthropic.svg",
      "claude-opus-4-20250514": "/anthropic.svg",
      "claude-sonnet-4-20250514": "/anthropic.svg",
    } as const,
    displayNames: {
      "claude-3-7-sonnet-latest": "Claude 3.7 Sonnet",
      "claude-3-5-haiku-latest": "Claude 3.5 Haiku",
      "claude-opus-4-20250514": "Claude 4 Opus",
      "claude-sonnet-4-20250514": "Claude 4 Sonnet",
    } as const,
  },
  groq: {
    models: [] as const,
    logo: "/meta.svg",
    modelLogos: {
      "meta-llama/llama-4-scout-17b-16e-instruct": "/meta.svg",
      "openai/gpt-oss-20b": "/openai.svg",
      "openai/gpt-oss-120b": "/openai.svg",
      "moonshotai/kimi-k2-instruct": "/moonshot.svg",
    } as const,
    displayNames: {
      "meta-llama/llama-4-scout-17b-16e-instruct": "Llama 4 Scout",
      "openai/gpt-oss-20b": "GPT-OSS 20B",
      "openai/gpt-oss-120b": "GPT-OSS 120B",
      "moonshotai/kimi-k2-instruct": "Kimi K2",
    } as const,
  },
} as const;

export const SPECIAL_LLAMA_PROMPT = `It is extremely important that you only respond in the "message" field in JSON format. Use the "usedSourceIndexes" field for any sources used, or an empty array if no sources are used. Do not return any fields that do not match the given schema.`;

export const KIMI_K2_PROMPT = `You must respond with a valid JSON object containing exactly two fields:
1. "message": Your response as a string
2. "usedSourceIndexes": An array of numbers representing the indexes of sources used, or an empty array if no sources were used

Example format:
{
  "message": "Your response here",
  "usedSourceIndexes": [0, 1]
}

Do not include any other fields or text outside the JSON object.`;

// Default values
// If adding a new provider, update app/api/conversations/[conversationId]/messages/utils.ts using the vercel ai-sdk
// If changing the DEFAULT_NAMING_MODEL, update createConversationName in app/api/conversations/[conversationId]/messages/utils.ts to use appropriate provider
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_NAMING_MODEL = "claude-sonnet-4-20250514";

// Derive types from the config
export type LLMProvider = keyof typeof PROVIDER_CONFIG;

// List of all currently valid model names for validation
export const ALL_VALID_MODELS = Object.values(PROVIDER_CONFIG).flatMap((config) => config.models) as string[];

// Create Zod schema for model validation
export const modelSchema = z.enum(ALL_VALID_MODELS as [string, ...string[]]);

// Type for validated model names
export type LLMModel = z.infer<typeof modelSchema>;

// Schema for array of models (used for disabledModels)
export const modelArraySchema = z.array(modelSchema).nullable();

// Helper function to get disabled models, handling null case
export function getDisabledModels(disabledModels: string[] | null): string[] {
  if (disabledModels === null) {
    return [];
  }
  // Filter out any models that aren't in ALL_VALID_MODELS
  return disabledModels.filter((model) => ALL_VALID_MODELS.includes(model));
}

// Helper function to get enabled models from disabled models
export function getEnabledModelsFromDisabled(disabledModels: string[] | null): string[] {
  if (!disabledModels?.length) {
    return ALL_VALID_MODELS;
  }
  // Return all valid models except the disabled ones
  return ALL_VALID_MODELS.filter((model) => !disabledModels.includes(model));
}

export function getProviderForModel(model: string): LLMProvider | null {
  // Validate the model first
  const parsed = modelSchema.safeParse(model);
  if (!parsed.success) return null;

  for (const [provider, config] of Object.entries(PROVIDER_CONFIG)) {
    if ((config.models as readonly string[]).includes(model)) {
      return provider as LLMProvider;
    }
  }
  return null;
}

// Logo and display name mappings
export const LLM_LOGO_MAP = Object.fromEntries(
  ALL_VALID_MODELS.map((model) => {
    const provider = getProviderForModel(model);
    if (!provider) return [model, [model, ""]];

    const providerConfig = PROVIDER_CONFIG[provider];
    // Use model-specific logo if available, otherwise fall back to provider logo
    const logo = providerConfig.modelLogos?.[model as keyof typeof providerConfig.modelLogos] || providerConfig.logo;
    return [model, [model, logo]];
  }),
) as Record<LLMModel, [string, string]>;

export const LLM_DISPLAY_NAMES = Object.fromEntries(
  ALL_VALID_MODELS.map((model) => {
    const provider = getProviderForModel(model);
    return [
      model,
      provider &&
      PROVIDER_CONFIG[provider].displayNames[model as keyof (typeof PROVIDER_CONFIG)[typeof provider]["displayNames"]]
        ? PROVIDER_CONFIG[provider].displayNames[
            model as keyof (typeof PROVIDER_CONFIG)[typeof provider]["displayNames"]
          ]
        : model,
    ];
  }),
) as Record<LLMModel, string>;
