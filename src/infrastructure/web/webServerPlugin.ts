import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

function extractCleanText(html: string): string {
  // Remove script and style elements
  let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  cleaned = cleaned.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
  cleaned = cleaned.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');

  // Extract paragraphs, headers, and list items
  const blockMatches = cleaned.match(/<(p|h1|h2|h3|h4|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi);
  if (blockMatches && blockMatches.length > 0) {
    const textPieces = blockMatches
      .map((block) => block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 30); // skip tiny fragments/links
    if (textPieces.length > 0) {
      return textPieces.slice(0, 30).join('\n\n');
    }
  }

  // Fallback: strip all tags
  const plain = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.slice(0, 5000);
}

export function learnWebRetrievalPlugin(): Plugin {
  return {
    name: 'learn-web-retrieval-plugin',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/api/learn/web-retrieval')) {
          return next();
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const { query } = JSON.parse(body || '{}');
            if (!query || typeof query !== 'string') {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Query is required' }));
              return;
            }

            // Discovery: search DuckDuckGo HTML or Wikipedia API
            const encodedQuery = encodeURIComponent(query);
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
            
            const searchResponse = await fetch(searchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              },
            });

            if (!searchResponse.ok) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ results: [] }));
              return;
            }

            const searchHtml = await searchResponse.text();

            const titleRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

            const discoveredUrls: Array<{ url: string; title: string }> = [];
            let match;
            while ((match = titleRegex.exec(searchHtml)) !== null && discoveredUrls.length < 3) {
              let rawUrl = match[1];
              // DuckDuckGo redirects: /l/?uddg=https%3A%2F%2F...
              if (rawUrl.includes('uddg=')) {
                const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
                if (uddgMatch) {
                  rawUrl = decodeURIComponent(uddgMatch[1]);
                }
              }
              const cleanTitle = match[2].replace(/<[^>]+>/g, '').trim();
              if (rawUrl.startsWith('http') && !rawUrl.includes('duckduckgo.com')) {
                discoveredUrls.push({ url: rawUrl, title: cleanTitle });
              }
            }

            // Fallback to Wikipedia search API if no duckduckgo results were extracted
            if (discoveredUrls.length === 0) {
              try {
                const wikiSearchUrl = `https://de.wikipedia.org/w/api.php?action=opensearch&search=${encodedQuery}&limit=2&namespace=0&format=json`;
                const wikiRes = await fetch(wikiSearchUrl);
                if (wikiRes.ok) {
                  const wikiData = await wikiRes.json();
                  const titles = wikiData[1] || [];
                  const links = wikiData[3] || [];
                  for (let i = 0; i < titles.length; i++) {
                    if (links[i]) {
                      discoveredUrls.push({ url: links[i], title: titles[i] });
                    }
                  }
                }
              } catch {
                // Ignore fallback error
              }
            }

            // Fetch actual page contents and extract readable text
            const results = [];
            for (const item of discoveredUrls) {
              try {
                const pageController = new AbortController();
                const timeoutId = setTimeout(() => pageController.abort(), 4000);
                const pageRes = await fetch(item.url, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                  },
                  signal: pageController.signal,
                });
                clearTimeout(timeoutId);

                if (pageRes.ok) {
                  const html = await pageRes.text();
                  const content = extractCleanText(html);
                  if (content.length > 100) {
                    const domain = new URL(item.url).hostname.replace(/^www\./, '');
                    results.push({
                      title: item.title,
                      url: item.url,
                      domain,
                      content: content.slice(0, 3500),
                      retrievedAt: new Date().toISOString(),
                    });
                  }
                }
              } catch {
                // If an individual page fails or times out, proceed to next
              }
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ results }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Web retrieval error',
              }),
            );
          }
        });
      });
    },
  };
}
