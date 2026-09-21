// Port of apps/resources/services.py. Every source fails soft: a broken or
// slow provider returns [] and the others still answer.

import type { Env } from "../env";

const REQUEST_TIMEOUT_MS = 10000;

export interface Resource {
  title: string;
  description: string;
  url: string;
  resource_type: string;
  source_name: string;
  author_or_channel: string;
  published_date: string;
  thumbnail: string;
}

function configuredKey(value?: string): boolean {
  const v = (value || "").trim();
  return Boolean(v && !v.toLowerCase().startsWith("your_"));
}

function cleanDescription(value: unknown, limit = 260): string {
  const text = String(value ?? "").replace(/\n/g, " ").split(/\s+/).filter(Boolean).join(" ");
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}...`;
}

export function normalizeType(resourceType?: string): string {
  const aliases: Record<string, string> = {
    all: "all", youtube: "youtube", textbook: "textbooks", textbooks: "textbooks",
    book: "textbooks", books: "textbooks", article: "articles", articles: "articles",
  };
  return aliases[(resourceType || "all").toLowerCase()] ?? "all";
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

async function youtube(env: Env, query: string, limit = 4): Promise<Resource[]> {
  if (!configuredKey(env.YOUTUBE_API_KEY)) return [];
  try {
    const params = new URLSearchParams({
      part: "snippet",
      q: `${query} tutorial lecture course explanation`,
      type: "video",
      maxResults: String(Math.min(limit, 10)),
      key: env.YOUTUBE_API_KEY!,
      safeSearch: "moderate",
    });
    const data = await getJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const results: Resource[] = [];
    for (const item of data.items ?? []) {
      const snippet = item.snippet ?? {};
      const videoId = item.id?.videoId;
      if (!videoId) continue;
      const thumbs = snippet.thumbnails ?? {};
      results.push({
        title: snippet.title ?? "YouTube tutorial",
        description: cleanDescription(snippet.description),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        resource_type: "youtube",
        source_name: "YouTube",
        author_or_channel: snippet.channelTitle ?? "",
        published_date: String(snippet.publishedAt ?? "").slice(0, 10),
        thumbnail: (thumbs.medium ?? thumbs.default ?? {}).url ?? "",
      });
    }
    return results.slice(0, limit);
  } catch (error) {
    console.warn(`YouTube resource search failed: ${error}`);
    return [];
  }
}

async function books(env: Env, query: string, limit = 3): Promise<Resource[]> {
  try {
    const params = new URLSearchParams({ q: query, maxResults: String(Math.min(limit, 10)), printType: "books" });
    if (configuredKey(env.GOOGLE_BOOKS_API_KEY)) params.set("key", env.GOOGLE_BOOKS_API_KEY!);
    const data = await getJson(`https://www.googleapis.com/books/v1/volumes?${params}`);
    const results: Resource[] = (data.items ?? []).map((item: any) => {
      const info = item.volumeInfo ?? {};
      const images = info.imageLinks ?? {};
      return {
        title: info.title ?? "Book recommendation",
        description: cleanDescription(info.description),
        url: info.infoLink || item.selfLink || "",
        resource_type: "textbook",
        source_name: "Google Books",
        author_or_channel: (info.authors ?? []).slice(0, 3).join(", "),
        published_date: String(info.publishedDate ?? "").slice(0, 10),
        thumbnail: images.thumbnail || images.smallThumbnail || "",
      };
    });
    return results.filter((r) => r.url).slice(0, limit);
  } catch (error) {
    console.warn(`Google Books resource search failed: ${error}`);
    return [];
  }
}

async function openAlex(env: Env, query: string, limit = 3): Promise<Resource[]> {
  try {
    const params = new URLSearchParams({ search: query, "per-page": String(Math.min(limit, 10)), filter: "type:article" });
    if (env.OPENALEX_EMAIL) params.set("mailto", env.OPENALEX_EMAIL);
    const data = await getJson(`https://api.openalex.org/works?${params}`);
    const results: Resource[] = (data.results ?? []).map((item: any) => {
      const abstract = item.abstract ?? item.abstract_inverted_index;
      let description = "";
      if (typeof abstract === "string") description = abstract;
      else if (abstract && typeof abstract === "object") {
        const words = Object.entries(abstract as Record<string, number[]>)
          .filter(([, positions]) => positions?.length)
          .map(([word, positions]) => [positions[0], word] as [number, string])
          .sort((a, b) => a[0] - b[0]);
        description = words.slice(0, 45).map(([, word]) => word).join(" ");
      }
      const primary = item.primary_location ?? {};
      const names = (item.authorships ?? []).map((a: any) => a?.author?.display_name).filter(Boolean);
      return {
        title: item.display_name ?? "Academic article",
        description: cleanDescription(description || "Academic article related to your search topic."),
        url: primary.landing_page_url || primary.pdf_url || item.doi || item.id || "",
        resource_type: "article",
        source_name: "OpenAlex",
        author_or_channel: names.slice(0, 3).join(", "),
        published_date: String(item.publication_year ?? ""),
        thumbnail: "",
      };
    });
    return results.filter((r) => r.url).slice(0, limit);
  } catch (error) {
    console.warn(`OpenAlex resource search failed: ${error}`);
    return [];
  }
}

async function crossref(query: string, limit = 5): Promise<Resource[]> {
  try {
    const params = new URLSearchParams({
      query,
      rows: String(Math.min(limit, 10)),
      select: "title,author,published-print,published-online,URL,container-title,abstract",
    });
    const data = await getJson(`https://api.crossref.org/works?${params}`);
    const results: Resource[] = [];
    for (const item of data.message?.items ?? []) {
      const url = item.URL || "";
      if (!url) continue;
      const authors = (item.author ?? [])
        .map((a: any) => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean);
      const parts = (item["published-print"] ?? item["published-online"] ?? {})["date-parts"] ?? [];
      const sourceTitle = (item["container-title"] ?? ["Crossref"])[0];
      results.push({
        title: (item.title ?? ["Academic article"])[0],
        description: cleanDescription(item.abstract || `Academic article indexed by ${sourceTitle}.`),
        url,
        resource_type: "article",
        source_name: "Crossref",
        author_or_channel: authors.slice(0, 3).join(", "),
        published_date: parts[0]?.[0] ? String(parts[0][0]) : "",
        thumbnail: "",
      });
    }
    return results.slice(0, limit);
  } catch (error) {
    console.warn(`Crossref resource search failed: ${error}`);
    return [];
  }
}

export async function combinedRecommendations(env: Env, rawQuery: string, resourceType = "all") {
  const query = (rawQuery || "").trim() || "computer science study resources";
  const type = normalizeType(resourceType);
  let results: Resource[];
  if (type === "youtube") results = await youtube(env, query, 10);
  else if (type === "textbooks") results = await books(env, query, 10);
  else if (type === "articles") {
    results = await openAlex(env, query, 10);
    if (results.length < 5) {
      const seen = new Set(results.map((r) => r.url));
      for (const item of await crossref(query, 10)) {
        if (!seen.has(item.url)) {
          results.push(item);
          seen.add(item.url);
        }
        if (results.length >= 10) break;
      }
    }
  } else {
    // Independent providers, so they are queried together.
    const [videos, textbooks, articles] = await Promise.all([youtube(env, query, 4), books(env, query, 3), openAlex(env, query, 3)]);
    results = [...videos, ...textbooks, ...articles];
  }
  return { query, type, count: Math.min(results.length, 10), results: results.slice(0, 10) };
}
