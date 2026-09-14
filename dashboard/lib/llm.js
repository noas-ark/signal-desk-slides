// Calls Claude via OpenRouter (OpenAI-compatible endpoint), reusing the
// exact Prompt A / Prompt B text from the Signal Desk deck (slide 06) so
// the live pipeline matches what was presented.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet";

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
  return JSON.parse(raw.slice(start));
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
2. Score FREQUENCY 1-5, how often this same complaint recurs.
3. Score SEVERITY 1-5, how much workflow, financial, or trust
   damage the complaint describes.
4. Note WHERE CONCENTRATED, platform, subreddit, or repo.
5. Flag it if the poster describes a workaround they built
   themselves. That is a stronger signal than the complaint alone.

Return one row per cluster, aggregating duplicates.

Raw items (indexed):
${raw}

Respond with ONLY a JSON array, no prose, no markdown fences, matching this shape:
[
  {
    "cluster": "string, specific failure in a job-to-be-done",
    "frequency": 1-5,
    "severity": 1-5,
    "concentratedIn": "string",
    "hasWorkaround": true/false,
    "itemIndexes": [indexes from the list above that belong to this cluster]
  }
]`;

  const content = await callOpenRouter([{ role: "user", content: prompt }], {
    maxTokens: 2000,
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
