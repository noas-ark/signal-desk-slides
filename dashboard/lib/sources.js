// Free, keyless (or optionally-keyed) public APIs only — matches the
// "what actually worked" findings from the Signal Desk research phase.
// Every fetcher returns normalized items:
//   { id, source, title, text, url, createdAt, score }
//
// Per-query requests within a source run in parallel (Promise.all) to stay
// inside Vercel's serverless function time limit now that there are 7
// sources — sequential awaits across ~60 requests were pushing past 60s.

const PER_QUERY_LIMIT = 5;

async function safeJson(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function mapSettled(list, fn) {
  const results = await Promise.allSettled(list.map(fn));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export async function fetchGithubIssues(queries) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "signal-desk-scanner",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return mapSettled(queries, async (q) => {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(
      q
    )}+is:issue&sort=created&order=desc&per_page=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(await fetch(url, { headers }));
      return (data.items ?? []).map((issue) => ({
        id: `github-${issue.id}`,
        source: "GitHub Issues",
        title: issue.title,
        text: (issue.body || "").slice(0, 1200),
        url: issue.html_url,
        createdAt: issue.created_at,
        score: issue.comments ?? 0,
      }));
    } catch (err) {
      console.error(`GitHub fetch failed for "${q}":`, err.message);
      return [];
    }
  });
}

export async function fetchHackerNews(queries) {
  return mapSettled(queries, async (q) => {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
      q
    )}&tags=(story,comment)&hitsPerPage=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(await fetch(url));
      return (data.hits ?? [])
        .map((hit) => {
          const text = hit.comment_text || hit.story_text || hit.title || "";
          if (!text) return null;
          return {
            id: `hn-${hit.objectID}`,
            source: "Hacker News",
            title: hit.title || text.slice(0, 80),
            text: text.slice(0, 1200),
            url:
              hit.url ||
              `https://news.ycombinator.com/item?id=${hit.objectID}`,
            createdAt: hit.created_at,
            score: hit.points ?? 0,
          };
        })
        .filter(Boolean);
    } catch (err) {
      console.error(`HN fetch failed for "${q}":`, err.message);
      return [];
    }
  });
}

export async function fetchReddit(queries) {
  return mapSettled(queries, async (q) => {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
      q
    )}&sort=new&limit=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(
        await fetch(url, {
          headers: { "User-Agent": "signal-desk-scanner/1.0" },
        })
      );
      return (data.data?.children ?? []).map((child) => {
        const post = child.data;
        return {
          id: `reddit-${post.id}`,
          source: `Reddit · r/${post.subreddit}`,
          title: post.title,
          text: (post.selftext || post.title || "").slice(0, 1200),
          url: `https://reddit.com${post.permalink}`,
          createdAt: new Date(post.created_utc * 1000).toISOString(),
          score: post.score ?? 0,
        };
      });
    } catch (err) {
      console.error(`Reddit fetch failed for "${q}":`, err.message);
      return [];
    }
  });
}

export async function fetchStackExchange(queries) {
  return mapSettled(queries, async (q) => {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(
      q
    )}&site=stackoverflow&pagesize=${PER_QUERY_LIMIT}&filter=withbody`;
    try {
      const data = await safeJson(await fetch(url));
      return (data.items ?? []).map((q2) => ({
        id: `stackoverflow-${q2.question_id}`,
        source: "Stack Overflow",
        title: q2.title,
        text: (q2.body || "").replace(/<[^>]+>/g, " ").slice(0, 1200),
        url: q2.link,
        createdAt: new Date(q2.creation_date * 1000).toISOString(),
        score: q2.score ?? 0,
      }));
    } catch (err) {
      console.error(`Stack Exchange fetch failed for "${q}":`, err.message);
      return [];
    }
  });
}

export async function fetchDevTo(tags = ["ai", "productivity", "webdev"]) {
  return mapSettled(tags, async (tag) => {
    const url = `https://dev.to/api/articles?tag=${encodeURIComponent(
      tag
    )}&per_page=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(await fetch(url));
      return (data ?? []).map((article) => ({
        id: `devto-${article.id}`,
        source: "dev.to",
        title: article.title,
        text: (article.description || "").slice(0, 1200),
        url: article.url,
        createdAt: article.published_at,
        score: article.public_reactions_count ?? 0,
      }));
    } catch (err) {
      console.error(`dev.to fetch failed for tag "${tag}":`, err.message);
      return [];
    }
  });
}

// Substack has no cross-publication search API, so this is a curated list
// of AI-tooling-focused newsletters, pulled via their free per-publication
// RSS feeds (every Substack exposes one at /feed, no auth needed).
const SUBSTACK_FEEDS = [
  "https://natesnewsletter.substack.com/feed",
  "https://www.oneusefulthing.org/feed",
];

function extractRssItems(xml) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of blocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return "";
      return m[1]
        .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
        .replace(/<[^>]+>/g, " ")
        .trim();
    };
    items.push({
      title: get("title"),
      link: get("link"),
      pubDate: get("pubDate"),
      description: get("description"),
    });
  }
  return items;
}

export async function fetchSubstack(keywordFilter) {
  return mapSettled(SUBSTACK_FEEDS, async (feedUrl) => {
    try {
      const res = await fetch(feedUrl);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const xml = await res.text();
      const publication = new URL(feedUrl).hostname;
      return extractRssItems(xml)
        .slice(0, 10)
        .filter((entry) => {
          const haystack = `${entry.title} ${entry.description}`.toLowerCase();
          return !keywordFilter || keywordFilter.test(haystack);
        })
        .map((entry) => ({
          id: `substack-${publication}-${entry.link}`,
          source: `Substack · ${publication}`,
          title: entry.title,
          text: entry.description.slice(0, 1200),
          url: entry.link,
          createdAt: entry.pubDate
            ? new Date(entry.pubDate).toISOString()
            : new Date().toISOString(),
          score: 0,
        }));
    } catch (err) {
      console.error(`Substack fetch failed for ${feedUrl}:`, err.message);
      return [];
    }
  });
}

// Many dev-tool communities run on Discourse, which exposes a free public
// JSON API by appending .json to any URL — no auth, no scraping needed.
const DISCOURSE_FORUMS = [
  "https://forum.cursor.com",
  "https://community.openai.com",
];

export async function fetchDiscourse(queries) {
  const pairs = DISCOURSE_FORUMS.flatMap((base) =>
    queries.slice(0, 4).map((q) => ({ base, q }))
  );
  return mapSettled(pairs, async ({ base, q }) => {
    const url = `${base}/search.json?q=${encodeURIComponent(q)}`;
    try {
      const data = await safeJson(await fetch(url));
      return (data.topics ?? []).slice(0, PER_QUERY_LIMIT).map((topic) => ({
        id: `discourse-${base}-${topic.id}`,
        source: `Discourse · ${new URL(base).hostname}`,
        title: topic.title,
        text: (topic.fancy_title || topic.title || "").slice(0, 1200),
        url: `${base}/t/${topic.slug}/${topic.id}`,
        createdAt: topic.created_at,
        score: topic.like_count ?? 0,
      }));
    } catch (err) {
      console.error(`Discourse fetch failed for ${base} "${q}":`, err.message);
      return [];
    }
  });
}

export async function fetchAllSources(queries) {
  const complaintFilter = /cursor|claude|copilot|windsurf|agent|context|hallucinat/i;
  const [github, hn, reddit, stackoverflow, devto, substack, discourse] =
    await Promise.all([
      fetchGithubIssues(queries),
      fetchHackerNews(queries),
      fetchReddit(queries),
      fetchStackExchange(queries),
      fetchDevTo(),
      fetchSubstack(complaintFilter),
      fetchDiscourse(queries),
    ]);
  return [
    ...github,
    ...hn,
    ...reddit,
    ...stackoverflow,
    ...devto,
    ...substack,
    ...discourse,
  ];
}
