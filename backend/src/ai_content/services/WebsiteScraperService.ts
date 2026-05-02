export class WebsiteScraperService {
  static async fetchWebsiteHtml(url: string): Promise<string> {
    console.log(`[WebsiteScraperService] Fetching HTML from: ${url}`);

    try {
      // Use Node.js fetch (available in Node 18+)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      console.log(`[WebsiteScraperService] Successfully fetched HTML (${html.length} chars)`);
      return html;
    } catch (error) {
      console.error(`[WebsiteScraperService] Failed to fetch website:`, error);
      throw new Error(`Failed to fetch website: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
