// Fetches and parses an RSS, Atom, or RDF feed.  Fetching is this module's
// job; parsing is entirely @rowanmanning/feed-parser's, which only ever
// sees a feed as an XML string and has no opinion about how it got there.

import { parseFeed } from "@rowanmanning/feed-parser";

// @rowanmanning/feed-parser's public entry only exports the `parseFeed`
// function, not its `Feed`/`FeedItem` types, so we derive them here instead
// of reaching into its internal module paths.
export type Feed = ReturnType<typeof parseFeed>;
export type FeedItem = Feed["items"][number];

export async function fetchFeed(
  url: string | URL,
  signal?: AbortSignal,
): Promise<Feed> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch feed: ${response.status} ${response.statusText}`,
    );
  }
  return parseFeed(await response.text());
}
