import { AIProvider, AIChatMessage, AIChatOptions, getAIConfig } from './types';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.defaultModel = getAIConfig().models.gemini;
  }

  async chatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Gemini API Key fehlt. Bitte trage VITE_GEMINI_API_KEY in deiner .env Datei ein.');
    }

    // Prepare messages for Gemini
    // Gemini uses a different structure: { contents: [{ role: 'user', parts: [{ text: '...' }] }] }
    // Note: Gemini 'system' role is handled differently in some versions, 
    // but here we'll use the common structure for simplicity or a compatible proxy if exists.
    // Since this is a client-side app, we might need a proxy or direct call to Google AI.
    
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages.filter(m => m.role !== 'system');
    
    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const model = options?.model || this.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
        generationConfig: {
          temperature: options?.temperature ?? 0.2,
          responseMimeType: options?.responseFormat === 'json_object' ? 'application/json' : 'text/plain',
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Gemini API Fehler (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Keine Antwort von Gemini erhalten');
    }

    return content;
  }
}
