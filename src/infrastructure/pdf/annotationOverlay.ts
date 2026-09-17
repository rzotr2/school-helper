/**
 * Pure helpers shared by PDF presentation and inspection. No DOM, no
 * React, no pdf.js objects — URL safety only, unit-tested without a
 * browser.
 */

const SAFE_LINK_PROTOCOL = /^(https?:\/\/|mailto:)/i;

/**
 * Whether a link annotation URL is safe to hand to an <a href>: only plain
 * web navigation and mail links are allowed. javascript:, data:, file: and
 * similar URLs are rendered as non-interactive hotspots instead of real
 * links, so a crafted PDF cannot execute code or exfiltrate local data.
 */
export function isSafeExternalLinkUrl(url: string): boolean {
  return SAFE_LINK_PROTOCOL.test(url);
}
