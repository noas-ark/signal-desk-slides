// Free, keyless (or optionally-keyed) public APIs only — matches the
// "what actually worked" findings from the Signal Desk research phase.
// Every fetcher returns normalized items:
//   { id, source, title, text, url, createdAt, score }

const PER_QUERY_LIMIT = 5;

async function safeJson(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchGithubIssues(queries) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "signal-desk-scanner",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const items = [];
  for (const q of queries) {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(
      q
    )}+is:issue&sort=created&order=desc&per_page=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(await fetch(url, { headers }));
      for (const issue of data.items ?? []) {
        items.push({
          id: `github-${issue.id}`,
          source: "GitHub Issues",
          title: issue.title,
          text: (issue.body || "").slice(0, 1200),
          url: issue.html_url,
          createdAt: issue.created_at,
          score: issue.comments ?? 0,
        });
      }
    } catch (err) {
      console.error(`GitHub fetch failed for "${q}":`, err.message);
    }
  }
  return items;
}

export async function fetchHackerNews(queries) {
  const items = [];
  for (const q of queries) {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
      q
    )}&tags=(story,comment)&hitsPerPage=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(await fetch(url));
      for (const hit of data.hits ?? []) {
        const text = hit.comment_text || hit.story_text || hit.title || "";
        if (!text) continue;
        items.push({
          id: `hn-${hit.objectID}`,
          source: "Hacker News",
          title: hit.title || text.slice(0, 80),
          text: text.slice(0, 1200),
          url:
            hit.url ||
            `https://news.ycombinator.com/item?id=${hit.objectID}`,
          createdAt: hit.created_at,
          score: hit.points ?? 0,
        });
      }
    } catch (err) {
      console.error(`HN fetch failed for "${q}":`, err.message);
    }
  }
  return items;
}

export async function fetchReddit(queries) {
  const items = [];
  for (const q of queries) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
      q
    )}&sort=new&limit=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(
        await fetch(url, {
          headers: { "User-Agent": "signal-desk-scanner/1.0" },
        })
      );
      for (const child of data.data?.children ?? []) {
        const post = child.data;
        items.push({
          id: `reddit-${post.id}`,
          source: `Reddit · r/${post.subreddit}`,
          title: post.title,
          text: (post.selftext || post.title || "").slice(0, 1200),
          url: `https://reddit.com${post.permalink}`,
          createdAt: new Date(post.created_utc * 1000).toISOString(),
          score: post.score ?? 0,
        });
      }
    } catch (err) {
      console.error(`Reddit fetch failed for "${q}":`, err.message);
    }
  }
  return items;
}

export async function fetchStackExchange(queries) {
  const items = [];
  for (const q of queries) {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(
      q
    )}&site=stackoverflow&pagesize=${PER_QUERY_LIMIT}&filter=withbody`;
    try {
      const data = await safeJson(await fetch(url));
      for (const q2 of data.items ?? []) {
        items.push({
          id: `stackoverflow-${q2.question_id}`,
          source: "Stack Overflow",
          title: q2.title,
          text: (q2.body || "").replace(/<[^>]+>/g, " ").slice(0, 1200),
          url: q2.link,
          createdAt: new Date(q2.creation_date * 1000).toISOString(),
          score: q2.score ?? 0,
        });
      }
    } catch (err) {
      console.error(`Stack Exchange fetch failed for "${q}":`, err.message);
    }
  }
  return items;
}

export async function fetchDevTo(tags = ["ai", "productivity", "webdev"]) {
  const items = [];
  for (const tag of tags) {
    const url = `https://dev.to/api/articles?tag=${encodeURIComponent(
      tag
    )}&per_page=${PER_QUERY_LIMIT}`;
    try {
      const data = await safeJson(await fetch(url));
      for (const article of data ?? []) {
        items.push({
          id: `devto-${article.id}`,
          source: "dev.to",
          title: article.title,
          text: (article.description || "").slice(0, 1200),
          url: article.url,
          createdAt: article.published_at,
          score: article.public_reactions_count ?? 0,
        });
      }
    } catch (err) {
      console.error(`dev.to fetch failed for tag "${tag}":`, err.message);
    }
  }
  return items;
}

export async function fetchAllSources(queries) {
  const [github, hn, reddit, stackoverflow, devto] = await Promise.all([
    fetchGithubIssues(queries),
    fetchHackerNews(queries),
    fetchReddit(queries),
    fetchStackExchange(queries),
    fetchDevTo(),
  ]);
  return [...github, ...hn, ...reddit, ...stackoverflow, ...devto];
}
