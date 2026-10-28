import { AIProvider, AIChatMessage, AIChatOptions, getAIConfig } from './types';

export class DeepSeekProvider implements AIProvider {
  readonly name = 'deepseek';
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly defaultModel: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.endpoint =
      typeof window !== 'undefined' && window.location.origin.includes('localhost')
        ? '/api/deepseek/chat/completions'
        : 'https://api.deepseek.com/chat/completions';
    
    this.defaultModel = getAIConfig().models.deepseek;
  }

  async chatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API Key fehlt. Bitte trage VITE_DEEPSEEK_API_KEY in deiner .env Datei ein.');
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        response_format: options?.responseFormat ? { type: options.responseFormat } : undefined,
        temperature: options?.temperature ?? 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`DeepSeek API Fehler (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Keine Antwort von DeepSeek erhalten');
    }

    return content;
  }
}
