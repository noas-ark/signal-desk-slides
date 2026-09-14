// Slide 04, step 03: "Notify team — ranked digest posted to [chat], tagged
// by cluster and score." Both channels are optional — each is a no-op if
// its webhook env var isn't set, so scans still work before you wire these
// up, and you can enable either or both independently.

const MAX_DESCRIPTION_CHARS = 240;

function buildDigestEntries({ clusters, draftCount }) {
  const top = [...clusters]
    .sort((a, b) => b.frequency + b.severity - (a.frequency + a.severity))
    .slice(0, 5);

  const entries = top.map((c, i) => ({
    rank: i + 1,
    name: c.cluster,
    meta: `freq ${c.frequency}/5, severity ${c.severity}/5${
      c.concentratedIn ? ` · ${c.concentratedIn}` : ""
    }${c.hasWorkaround ? " · workaround seen" : ""}`,
    description: (c.description || "").slice(0, MAX_DESCRIPTION_CHARS),
  }));

  return {
    summary: `Signal Desk scan complete — ${clusters.length} clusters, ${draftCount} drafted replies awaiting review.`,
    entries,
  };
}

export async function notifySlack({ clusters, draftCount, dashboardUrl }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "SLACK_WEBHOOK_URL not set" };
  if (!clusters || clusters.length === 0) {
    return { sent: false, reason: "no clusters to report" };
  }

  const { summary, entries } = buildDigestEntries({ clusters, draftCount });
  const text = [
    `*${summary}*`,
    "",
    ...entries.flatMap((e) => [
      `*${e.rank}. ${e.name}* — ${e.meta}`,
      e.description ? `_${e.description}_` : null,
      "",
    ]).filter(Boolean),
    `<${dashboardUrl}|Review the full matrix and drafts →>`,
  ].join("\n");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook ${res.status}: ${body.slice(0, 300)}`);
  }
  return { sent: true };
}

export async function notifyDiscord({ clusters, draftCount, dashboardUrl }) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "DISCORD_WEBHOOK_URL not set" };
  if (!clusters || clusters.length === 0) {
    return { sent: false, reason: "no clusters to report" };
  }

  const { summary, entries } = buildDigestEntries({ clusters, draftCount });
  let content = [
    `**${summary}**`,
    "",
    ...entries.flatMap((e) => [
      `**${e.rank}. ${e.name}** — ${e.meta}`,
      e.description || null,
      "",
    ]).filter(Boolean),
    `Review the full matrix and drafts → ${dashboardUrl}`,
  ].join("\n");

  // Discord caps message content at 2000 chars.
  if (content.length > 1950) {
    content = content.slice(0, 1950) + "…";
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord webhook ${res.status}: ${body.slice(0, 300)}`);
  }
  return { sent: true };
}

export async function notifyAll(args) {
  const [slack, discord] = await Promise.allSettled([
    notifySlack(args),
    notifyDiscord(args),
  ]);
  return {
    slack: slack.status === "fulfilled" ? slack.value : { sent: false, error: slack.reason.message },
    discord: discord.status === "fulfilled" ? discord.value : { sent: false, error: discord.reason.message },
  };
}
