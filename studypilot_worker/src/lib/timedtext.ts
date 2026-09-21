// Parse YouTube timed-text caption files into plain text. Shared with the
// frontend: the Worker only fetches the caption file, and the browser parses it,
// because parsing an hour-long lecture's captions costs more CPU than the free
// Workers plan allows per request.

import { cleanExtractedText } from "./text";

function unescapeHtml(text: string): string {
  const once = (s: string) =>
    s
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  // Timed text is often escaped twice (&amp;#39;).
  return once(once(text));
}

export function parseTimedText(xml: string): string {
  if (!xml) return "";
  let pieces = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
  // srv3 wraps lines in <p> with word-level <s> spans.
  if (!pieces.length) pieces = [...xml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  if (!pieces.length) return "";
  return cleanExtractedText(pieces.map((piece) => unescapeHtml(piece.replace(/<[^>]+>/g, ""))).join(" "));
}

/** Cheap check that a caption file has real content, without parsing it. */
export function looksLikeCaptions(xml: string): boolean {
  let found = 0;
  for (const marker of ["<text", "<p "]) {
    let index = xml.indexOf(marker);
    while (index >= 0 && found < 3) {
      found++;
      index = xml.indexOf(marker, index + 1);
    }
  }
  return found >= 3;
}
