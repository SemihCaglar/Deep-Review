export class WebsiteScraperService {
  static async fetchWebsiteHtml(url: string): Promise<string> {
    console.log(`[WebsiteScraperService] Fetching HTML from: ${url}`);

    try {
      // Use AbortController for timeout since fetch doesn't support timeout option directly
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        console.log(`[WebsiteScraperService] Successfully fetched HTML (${html.length} chars)`);
        return html;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      console.error(`[WebsiteScraperService] Failed to fetch website:`, error);
      throw new Error(`Failed to fetch website: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
