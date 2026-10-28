import { DeepSeekProvider } from './DeepSeekProvider';
import { GeminiProvider } from './GeminiProvider';
import { AIProvider, getAIConfig } from './types';

export class AIFactory {
  private static instance: AIProvider | null = null;

  static getProvider(): AIProvider {
    if (this.instance) {
      return this.instance;
    }

    const config = getAIConfig();
    
    switch (config.provider) {
      case 'gemini':
        this.instance = new GeminiProvider(config.keys.gemini);
        break;
      case 'deepseek':
      default:
        this.instance = new DeepSeekProvider(config.keys.deepseek);
        break;
    }

    return this.instance;
  }

  /**
   * For testing or manual override
   */
  static setProvider(provider: AIProvider) {
    this.instance = provider;
  }
}
