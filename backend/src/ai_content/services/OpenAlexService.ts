import https from 'https';

const MAILTO = process.env.OPENALEX_MAILTO || 'pug-contend-simile@duck.com';
const TIMEOUT_MS = 15000; // 15 seconds to account for rate limiting delays

export interface OpenAlexWork {
  id: string | null;
  title: string | null;
  doi: string | null;
  year: number | null;
}

export class OpenAlexUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAlexUnavailableError';
  }
}

function addMailto(url: URL): void {
  if (MAILTO) url.searchParams.set('mailto', MAILTO);
}

async function fetchJson(urlString: string, retries = 3): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    let result: { data: any; status: number | undefined } | null = null;
    let fetchError: Error | null = null;

    try {
      result = await new Promise<{ data: any; status: number | undefined }>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new OpenAlexUnavailableError('OpenAlex request timed out')),
          TIMEOUT_MS
        );

        https
          .get(urlString, { headers: { 'User-Agent': 'reference-verifier/1.0' } }, (res) => {
            clearTimeout(timer);

            if (res.statusCode === 404 || res.statusCode === 400) {
              res.resume();
              resolve({ data: null, status: res.statusCode });
              return;
            }

            if (res.statusCode === 429) {
              res.resume();
              resolve({ data: null, status: 429 });
              return;
            }

            if (!res.statusCode || res.statusCode >= 500) {
              res.resume();
              reject(new OpenAlexUnavailableError(`OpenAlex returned HTTP ${res.statusCode}`));
              return;
            }

            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
              try {
                resolve({ data: JSON.parse(body), status: res.statusCode });
              } catch {
                reject(new OpenAlexUnavailableError('OpenAlex returned invalid JSON'));
              }
            });
          })
          .on('error', (err) => {
            clearTimeout(timer);
            reject(new OpenAlexUnavailableError(`OpenAlex network error: ${err.message}`));
          });
      });
    } catch (err) {
      fetchError = err as Error;
    }

    if (result?.status === 429 || fetchError) {
      if (attempt < retries) {
        const delay = Math.min(5000 * (attempt + 1), 30000);
        console.warn(`[OpenAlex] ${fetchError ? fetchError.message : 'Rate limited (429)'}. Retrying in ${delay / 1000}s (${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw fetchError ?? new OpenAlexUnavailableError('OpenAlex rate limit exceeded after retries');
    }

    return result!.data;
  }

  throw new OpenAlexUnavailableError('OpenAlex unavailable after retries');
}

function mapWork(raw: any): OpenAlexWork {
  return {
    id: raw.id ?? null,
    title: raw.title ?? null,
    doi: raw.doi ?? null,
    year: raw.publication_year ?? null,
  };
}

export class OpenAlexService {
  static async lookupByDoi(doi: string): Promise<OpenAlexWork | null> {
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '');
    const url = new URL(
      `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(cleanDoi)}`
    );
    addMailto(url);

    const raw = await fetchJson(url.toString());
    return raw ? mapWork(raw) : null;
  }

  static async lookupByTitle(title: string): Promise<OpenAlexWork | null> {
    const url = new URL('https://api.openalex.org/works');
    url.searchParams.set('search', title.slice(0, 250));
    url.searchParams.set('per-page', '1');
    addMailto(url);

    const raw = await fetchJson(url.toString());
    if (!raw || !raw.results || raw.results.length === 0) return null;
    return mapWork(raw.results[0]);
  }
}
