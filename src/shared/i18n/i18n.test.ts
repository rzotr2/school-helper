import { describe, it, expect } from 'vitest';
import { en } from './translations/en';
import { de } from './translations/de';
import { translate, formatTemplate } from './LanguageContext';

function getAllKeys(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys = keys.concat(getAllKeys(v, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

describe('i18n completeness and parity', () => {
  const enKeys = getAllKeys(en).sort();
  const deKeys = getAllKeys(de).sort();

  it('has identical keys in English and German', () => {
    const missingInDe = enKeys.filter((k) => !deKeys.includes(k));
    const missingInEn = deKeys.filter((k) => !enKeys.includes(k));

    expect(missingInDe, `Keys missing in de.ts: ${missingInDe.join(', ')}`).toEqual([]);
    expect(missingInEn, `Keys missing in en.ts: ${missingInEn.join(', ')}`).toEqual([]);
    expect(enKeys.length).toBe(deKeys.length);
    expect(enKeys.length).toBeGreaterThan(100);
  });

  it('contains no empty strings in English translations', () => {
    for (const key of enKeys) {
      const val = getByPath(en, key);
      expect(typeof val, `Key "${key}" should be a string`).toBe('string');
      expect(val.trim().length, `Key "${key}" in en.ts must not be empty`).toBeGreaterThan(0);
    }
  });

  it('contains no empty strings in German translations', () => {
    for (const key of deKeys) {
      const val = getByPath(de, key);
      expect(typeof val, `Key "${key}" should be a string`).toBe('string');
      expect(val.trim().length, `Key "${key}" in de.ts must not be empty`).toBeGreaterThan(0);
    }
  });

  it('interpolates simple parameters', () => {
    const template = 'Page {current} of {total}';
    expect(formatTemplate(template, { current: 2, total: 10 })).toBe('Page 2 of 10');
  });

  it('handles plural forms', () => {
    const template = '{count, plural, one {item} other {items}}';
    expect(formatTemplate(template, { count: 1 })).toBe('item');
    expect(formatTemplate(template, { count: 5 })).toBe('items');
    expect(formatTemplate(template, { count: 0 })).toBe('items');
  });

  it('translates with fallback', () => {
    expect(translate('en', 'common.save')).toBe('Save');
    expect(translate('de', 'common.save')).toBe('Speichern');
    // Non-existent key returns the path itself
    expect(translate('en', 'non.existent.key')).toBe('non.existent.key');
  });

  it('every t(...) call in codebase references a valid key in en and de', async () => {
    const fs = await import('fs');
    const path = await import('path');

    function walk(dir: string): string[] {
      let files: string[] = [];
      for (const item of fs.readdirSync(dir)) {
        const p = path.join(dir, item);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          if (item !== 'node_modules' && item !== '.git' && item !== 'dist') {
            files.push(...walk(p));
          }
        } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
          files.push(p);
        }
      }
      return files;
    }

    const files = walk('src');
    const missingKeys: { file: string; line: number; key: string }[] = [];

    // Valid prefixes for dynamic calls
    const knownDynamicPrefixes = [
      'learning.states.',
      'learning.difficulties.',
      'documents.types.',
    ];

    for (const file of files) {
      if (
        file.includes('translations/en.ts') ||
        file.includes('translations/de.ts') ||
        file.includes('i18n.test.ts')
      ) {
        continue;
      }

      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((lineText, idx) => {
        // Match t('...') and t("...")
        const staticMatches = lineText.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g);
        for (const m of staticMatches) {
          const key = m[1];
          if (!enKeys.includes(key)) {
            missingKeys.push({ file, line: idx + 1, key });
          }
        }

        // Match t(`prefix.${var}`)
        const dynamicMatches = lineText.matchAll(/\bt\(\s*`([a-zA-Z0-9_.-]+)\.\$\{/g);
        for (const m of dynamicMatches) {
          const prefix = m[1];
          // Check that the prefix namespace exists in enKeys
          const hasPrefix = enKeys.some((k) => k.startsWith(`${prefix}.`));
          if (!hasPrefix) {
            missingKeys.push({ file, line: idx + 1, key: `${prefix}.*` });
          }
        }
      });
    }

    expect(
      missingKeys,
      `Found missing translation keys in code:\n${missingKeys.map((m) => `  ${m.file}:${m.line} -> "${m.key}"`).join('\n')}`,
    ).toEqual([]);
  });
});
