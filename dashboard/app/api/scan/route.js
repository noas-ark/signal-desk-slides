import { buildQueries } from "@/lib/keywords";
import { fetchAllSources } from "@/lib/sources";
import { clusterAndScore, draftReply } from "@/lib/llm";
import { saveResults, loadResults } from "@/lib/store";
import { notifyAll } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITEMS_RETAINED = 150;
const MAX_ITEMS_FOR_CLUSTERING = 60; // keeps the Claude call fast + bounded
const MAX_DRAFTS_PER_RUN = 5;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured: open (dev/demo mode)
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const errors = [];

  let newItems = [];
  try {
    const queries = buildQueries({ maxQueries: 8 });
    newItems = await fetchAllSources(queries);
  } catch (err) {
    errors.push(`fetchAllSources: ${err.message}`);
  }

  const previous = (await loadResults()) || { items: [], drafts: [] };
  const seen = new Map(previous.items.map((it) => [it.id, it]));
  for (const it of newItems) seen.set(it.id, it);

  const items = Array.from(seen.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_ITEMS_RETAINED);

  let clusters = previous.clusters || [];
  try {
    const forClustering = [...items]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, MAX_ITEMS_FOR_CLUSTERING);
    clusters = await clusterAndScore(forClustering);
    clusters.sort(
      (a, b) => b.frequency + b.severity - (a.frequency + a.severity)
    );
  } catch (err) {
    errors.push(`clusterAndScore: ${err.message}`);
  }

  const draftCandidates = [...items]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, MAX_DRAFTS_PER_RUN);

  const draftResults = await Promise.allSettled(
    draftCandidates.map((item) => draftReply(item, { founderName: "Div" }))
  );
  const drafts = [];
  draftResults.forEach((result, i) => {
    const item = draftCandidates[i];
    if (result.status === "fulfilled") {
      drafts.push({
        itemId: item.id,
        source: item.source,
        title: item.title,
        url: item.url,
        draft: result.value,
        status: "pending",
      });
    } else {
      errors.push(`draftReply(${item.id}): ${result.reason.message}`);
    }
  });

  const results = {
    updatedAt: new Date().toISOString(),
    startedAt,
    sourceCount: newItems.length,
    items,
    clusters,
    drafts,
    errors,
  };

  try {
    await saveResults(results);
  } catch (err) {
    return Response.json(
      { error: `saveResults failed: ${err.message}`, results },
      { status: 500 }
    );
  }

  const notify = await notifyAll({
    clusters,
    draftCount: drafts.length,
    dashboardUrl: new URL(request.url).origin,
  });
  if (notify.slack.error) errors.push(`notifySlack: ${notify.slack.error}`);
  if (notify.discord.error) errors.push(`notifyDiscord: ${notify.discord.error}`);

  return Response.json({
    ok: true,
    newItemCount: newItems.length,
    totalItemCount: items.length,
    clusterCount: clusters.length,
    draftCount: drafts.length,
    slackNotified: notify.slack.sent,
    discordNotified: notify.discord.sent,
    errors,
  });
}
