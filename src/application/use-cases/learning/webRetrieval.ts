import type { GroundedSource } from './learningTypes';

interface ServerWebResult {
  title: string;
  url: string;
  domain: string;
  content: string;
  retrievedAt: string;
}

/**
 * Executes a targeted web search for the subject and topics to discover
 * authoritative, current information.
 *
 * Calls the server-side endpoint /api/learn/web-retrieval to fetch and extract
 * readable page contents without browser CORS limitations.
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
      return [];
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
    return [];
  }
}
