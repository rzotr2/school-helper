export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatOptions {
  model?: string;
  temperature?: number;
  responseFormat?: 'json_object' | 'text';
  maxTokens?: number;
}

export interface AIProvider {
  name: string;
  chatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string>;
}

export type AIProviderType = 'deepseek' | 'gemini' | 'openai';

export function getAIConfig() {
  const provider = (import.meta as any).env?.VITE_AI_PROVIDER || 'deepseek';
  const deepseekKey = (import.meta as any).env?.VITE_DEEPSEEK_API_KEY || '';
  const geminiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
  const openaiKey = (import.meta as any).env?.VITE_OPENAI_API_KEY || '';

  const deepseekModel = (import.meta as any).env?.VITE_DEEPSEEK_MODEL || 'deepseek-chat';
  const geminiModel = (import.meta as any).env?.VITE_GEMINI_MODEL || 'gemini-1.5-flash';
  const openaiModel = (import.meta as any).env?.VITE_OPENAI_MODEL || 'gpt-4o';

  return {
    provider: provider as AIProviderType,
    keys: {
      deepseek: deepseekKey,
      gemini: geminiKey,
      openai: openaiKey,
    },
    models: {
      deepseek: deepseekModel,
      gemini: geminiModel,
      openai: openaiModel,
    },
  };
}
