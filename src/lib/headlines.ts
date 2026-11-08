// News headlines via RSS — deliberately tiny parser, no dependency.
// Used for Daily Movers context (per-company Google News searches) and
// the World board (market feeds). Headlines are always linked out to
// the publisher, never republished.

export type Headline = {
  title: string;
  url: string;
  source: string | null;
  publishedAt: Date | null;
};

function deCdata(s: string): string {
  return s
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? deCdata(m[1]) : null;
}

/** Parse an RSS 2.0 feed into headlines (newest first, as published). */
export function parseRss(xml: string): Headline[] {
  const items = xml.split(/<item[\s>]/).slice(1);
  const out: Headline[] = [];
  for (const raw of items) {
    const block = raw.split("</item>")[0];
    let title = tag(block, "title");
    const url = tag(block, "link");
    if (!title || !url) continue;
    let source = tag(block, "source");
    // Google News appends " - Publisher" to titles; split it off.
    if (!source) {
      const m = title.match(/^(.*) - ([^-]{2,40})$/);
      if (m) {
        title = m[1].trim();
        source = m[2].trim();
      }
    }
    const pub = tag(block, "pubDate");
    const publishedAt = pub ? new Date(pub) : null;
    out.push({
      title,
      url,
      source,
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
    });
  }
  return out;
}

export async function fetchRss(url: string, timeoutMs = 20000): Promise<Headline[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ROast/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}

export function googleNewsSearchUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/**
 * Headlines about one company inside a time window — the "what was in
 * the news around then" set for the movers page. Context, not a cause.
 */
export async function fetchCompanyHeadlines(
  companyName: string,
  from: Date,
  to: Date,
  cap = 3
): Promise<Headline[]> {
  const clean = companyName.replace(/\b(Limited|LIMITED|Ltd|LTD)\b/g, "").replace(/\s+/g, " ").trim();
  const items = await fetchRss(googleNewsSearchUrl(`${clean} share price`));
  const inWindow = items.filter(
    (h) => h.publishedAt && h.publishedAt >= from && h.publishedAt <= to
  );
  const seen = new Set<string>();
  const out: Headline[] = [];
  for (const h of inWindow) {
    const key = h.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= cap) break;
  }
  return out;
}
