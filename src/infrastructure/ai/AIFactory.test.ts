import { describe, it, expect, vi } from 'vitest';
import { AIFactory } from './AIFactory';
import { DeepSeekProvider } from './DeepSeekProvider';
import { GeminiProvider } from './GeminiProvider';

describe('AIFactory', () => {
  it('should return DeepSeekProvider by default', () => {
    // Mock environment
    vi.stubEnv('VITE_AI_PROVIDER', 'deepseek');
    
    const provider = AIFactory.getProvider();
    expect(provider).toBeInstanceOf(DeepSeekProvider);
    expect(provider.name).toBe('deepseek');
  });

  it('should return GeminiProvider when configured', () => {
    // We need to clear the instance since it's a singleton in AIFactory
    (AIFactory as any).instance = null;
    vi.stubEnv('VITE_AI_PROVIDER', 'gemini');
    
    const provider = AIFactory.getProvider();
    expect(provider).toBeInstanceOf(GeminiProvider);
    expect(provider.name).toBe('gemini');
  });
});
