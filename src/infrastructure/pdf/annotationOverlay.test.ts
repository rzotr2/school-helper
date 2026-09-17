import { describe, expect, it } from 'vitest';
import { isSafeExternalLinkUrl } from './annotationOverlay';

describe('isSafeExternalLinkUrl', () => {
  it('allows web and mail navigation', () => {
    expect(isSafeExternalLinkUrl('https://example.com/skript.pdf')).toBe(true);
    expect(isSafeExternalLinkUrl('http://example.com')).toBe(true);
    expect(isSafeExternalLinkUrl('mailto:kontakt@example.com')).toBe(true);
    expect(isSafeExternalLinkUrl('HTTPS://EXAMPLE.COM')).toBe(true);
  });

  it('rejects non-navigation protocols and relative targets', () => {
    expect(isSafeExternalLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalLinkUrl('data:text/html;base64,xxx')).toBe(false);
    expect(isSafeExternalLinkUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalLinkUrl('ftp://example.com/x')).toBe(false);
    expect(isSafeExternalLinkUrl('example.com')).toBe(false);
    expect(isSafeExternalLinkUrl('')).toBe(false);
  });
});
