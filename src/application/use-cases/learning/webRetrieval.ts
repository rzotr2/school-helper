import type { GroundedSource } from './learningTypes';

interface ServerWebResult {
  title: string;
  url: string;
  domain: string;
  content: string;
  retrievedAt: string;
}

async function fetchWikipediaFallback(
  query: string,
  fetchFn: typeof fetch,
): Promise<GroundedSource[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srlimit=2&utf8=1&format=json&origin=*`;
    const res = await fetchFn(url);
    if (!res.ok) return [];
    const data = await res.json();
    const searchItems = data?.query?.search;
    if (!Array.isArray(searchItems)) return [];

    return searchItems
      .filter((item: any) => item?.title && item?.snippet)
      .map((item: any, idx: number) => {
        const cleanSnippet = String(item.snippet).replace(/<[^>]+>/g, '').trim();
        return {
          id: `web-${idx + 1}`,
          type: 'web' as const,
          title: String(item.title),
          url: `https://de.wikipedia.org/wiki/${encodeURIComponent(String(item.title).replace(/ /g, '_'))}`,
          domain: 'de.wikipedia.org',
          content: cleanSnippet,
          retrievedAt: new Date().toISOString(),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Executes a targeted web search for the subject and topics to discover
 * authoritative, current information.
 *
 * Calls the server-side endpoint /api/learn/web-retrieval to fetch and extract
 * readable page contents without browser CORS limitations, with a direct
 * CORS-enabled Wikipedia fallback if the endpoint is unreachable.
 */
export async function retrieveWebSources(
  subjectName: string,
  topicNames: string[],
  fetchFn: typeof fetch = fetch,
): Promise<GroundedSource[]> {
  if (!topicNames || topicNames.length === 0) {
    return [];
  }

  const query = `${subjectName} ${topicNames.join(' ')} Definition Grundlagen Dokumentation`.trim();

  try {
    const response = await fetchFn('/api/learn/web-retrieval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      console.warn('[webRetrieval] Web retrieval endpoint returned status', response.status);
      return fetchWikipediaFallback(`${subjectName} ${topicNames.join(' ')}`.trim(), fetchFn);
    }

    const data = await response.json();
    const results: ServerWebResult[] = Array.isArray(data?.results) ? data.results : [];

    return results.map((item, idx) => ({
      id: `web-${idx + 1}`,
      type: 'web',
      title: item.title,
      url: item.url,
      domain: item.domain,
      content: item.content,
      retrievedAt: item.retrievedAt,
    }));
  } catch (err) {
    console.warn('[webRetrieval] Failed to retrieve web sources:', err);
    return fetchWikipediaFallback(`${subjectName} ${topicNames.join(' ')}`.trim(), fetchFn);
  }
}
