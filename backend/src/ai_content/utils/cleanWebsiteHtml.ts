export function cleanWebsiteHtml(html: string): string {
  let text = html;

  // Remove script and style tags
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--.*?-->/gs, '');

  // Replace common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&amp;/g, '&');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Collapse multiple whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Limit to reasonable length for LLM processing
  if (text.length > 50000) {
    text = text.substring(0, 50000);
  }

  return text;
}
