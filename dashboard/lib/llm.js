// Calls Claude via OpenRouter (OpenAI-compatible endpoint), reusing the
// exact Prompt A / Prompt B text from the Signal Desk deck (slide 06) so
// the live pipeline matches what was presented.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

async function callOpenRouter(messages, { maxTokens = 2000 } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://signal-desk.vercel.app",
      "X-Title": "Signal Desk",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error(`No JSON found in model output: ${text.slice(0, 200)}`);
  const body = raw.slice(start);
  try {
    return JSON.parse(body);
  } catch (err) {
    // Output was likely truncated by the token limit. If it's a JSON array,
    // salvage complete elements up to the last well-formed "},".
    if (body.trimStart().startsWith("[")) {
      const lastComplete = body.lastIndexOf("},");
      if (lastComplete > 0) {
        try {
          return JSON.parse(body.slice(0, lastComplete + 1) + "]");
        } catch {
          // fall through to original error
        }
      }
    }
    throw err;
  }
}

// Prompt A: cluster and score raw items into a ranked problem-opportunity
// matrix. Mirrors slide 06's "Prompt A" verbatim, with a JSON-output
// instruction appended so the result is machine-readable.
export async function clusterAndScore(items) {
  if (items.length === 0) return [];

  const raw = items
    .map(
      (it, i) =>
        `[${i}] (${it.source}) ${it.title}\n${it.text}\nURL: ${it.url}`
    )
    .join("\n\n");

  const prompt = `You are a research analyst screening startup problem signal.
For each raw item I give you (from GitHub issues, forums, or reviews):

1. Assign it to a problem cluster. Name the cluster as a specific
   failure in a job-to-be-done, not a vague category.
2. Write a robust 2-3 sentence DESCRIPTION of the problem: what
   actually breaks, the likely root cause if inferable from the
   complaints, and who is affected (which users, in which workflow).
   Be concrete — cite the specific mechanism, not a restatement of
   the cluster name.
3. Score FREQUENCY 1-5, how often this same complaint recurs.
4. Score SEVERITY 1-5, how much workflow, financial, or trust
   damage the complaint describes.
5. Note WHERE CONCENTRATED, platform, subreddit, or repo.
6. Flag it if the poster describes a workaround they built
   themselves. That is a stronger signal than the complaint alone.

Return one row per cluster, aggregating duplicates. List at most 8
itemIndexes per cluster (the most representative ones) even if more belong
to it — this keeps the response a bounded size.

Raw items (indexed):
${raw}

Respond with ONLY a JSON array, no prose, no markdown fences, matching this shape:
[
  {
    "cluster": "string, specific failure in a job-to-be-done",
    "description": "2-3 sentence robust description: mechanism, root cause, who's affected",
    "frequency": 1-5,
    "severity": 1-5,
    "concentratedIn": "string",
    "hasWorkaround": true/false,
    "itemIndexes": [indexes from the list above that belong to this cluster]
  }
]`;

  const content = await callOpenRouter([{ role: "user", content: prompt }], {
    maxTokens: 6000,
  });
  const clusters = extractJson(content);
  return clusters.map((c) => ({
    ...c,
    items: (c.itemIndexes || [])
      .map((i) => items[i])
      .filter(Boolean)
      .map((it) => ({ source: it.source, title: it.title, url: it.url })),
  }));
}

// Turns a free-text problem area ("customer support for AI agents") into
// concrete search queries the real fetchers can run against GitHub, HN,
// Reddit, Stack Overflow, and Discourse — the same "pick terms, not vague
// categories" discipline from slide 01, applied on demand.
export async function expandProblemArea(problemArea) {
  const prompt = `A founder wants to find real, acute customer complaints related to this problem area: "${problemArea}"

Generate 8 concrete search queries that would surface actual complaints (not marketing copy) on GitHub Issues, Hacker News, Reddit, Stack Overflow, or developer forums. Each query should combine a specific product/tool/platform name (real ones, if you know likely candidates in this space) with a specific symptom or failure word (e.g. "crashes", "won't sync", "loses data", "rate limited", "silently fails"). Avoid generic single-word queries.

Respond with ONLY a JSON array of 8 strings, no prose, no markdown fences:
["query 1", "query 2", ...]`;

  const content = await callOpenRouter([{ role: "user", content: prompt }], {
    maxTokens: 500,
  });
  const queries = extractJson(content);
  if (!Array.isArray(queries)) throw new Error("expandProblemArea: expected a JSON array");
  return queries.filter((q) => typeof q === "string" && q.trim()).slice(0, 8);
}

// Prompt B: draft a reply for one item, astroturf guardrails built in.
// Mirrors slide 06's "Prompt B" verbatim.
export async function draftReply(item, { founderName = "the founder" } = {}) {
  const prompt = `Draft a reply from ${founderName}, building tooling for the problem described below.
Here is the exact complaint and source link: "${item.text}" (${item.url})

Rules:
- Under 80 words. Sign with the founder's real name.
- Reference the specific detail they described, not a summary.
- Offer something useful first (a workaround, a direct answer)
  before making any ask.
- If asking for time, frame it as customer discovery, never as a
  pitch or a beta invite.
- Do not claim experience we do not have.
- If the exchange goes past one reply, disclose we are building
  something in this space.
- No marketing language.

Respond with ONLY the drafted reply text, no prose, no preamble, no quotes around it.`;

  const content = await callOpenRouter([{ role: "user", content: prompt }], {
    maxTokens: 300,
  });
  return content.trim();
}
