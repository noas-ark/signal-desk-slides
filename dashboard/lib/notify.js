// Slide 04, step 03: "Notify team — ranked digest posted to [chat], tagged
// by cluster and score." Both channels are optional — each is a no-op if
// its webhook env var isn't set, so scans still work before you wire these
// up, and you can enable either or both independently.

function buildDigestLines({ clusters, draftCount }) {
  const top = [...clusters]
    .sort((a, b) => b.frequency + b.severity - (a.frequency + a.severity))
    .slice(0, 5);

  const lines = top.map(
    (c, i) =>
      `${i + 1}. ${c.cluster} — freq ${c.frequency}/5, severity ${c.severity}/5${
        c.concentratedIn ? ` (${c.concentratedIn})` : ""
      }`
  );

  return {
    summary: `Signal Desk scan complete — ${clusters.length} clusters, ${draftCount} drafted replies awaiting review.`,
    lines,
  };
}

export async function notifySlack({ clusters, draftCount, dashboardUrl }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "SLACK_WEBHOOK_URL not set" };
  if (!clusters || clusters.length === 0) {
    return { sent: false, reason: "no clusters to report" };
  }

  const { summary, lines } = buildDigestLines({ clusters, draftCount });
  const text = [
    `*${summary}*`,
    "",
    ...lines.map((l) => `*${l.split(" — ")[0]}* — ${l.split(" — ").slice(1).join(" — ")}`),
    "",
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

  const { summary, lines } = buildDigestLines({ clusters, draftCount });
  const content = [
    `**${summary}**`,
    "",
    ...lines.map((l) => {
      const [name, rest] = l.split(" — ");
      return `**${name}** — ${rest}`;
    }),
    "",
    `Review the full matrix and drafts → ${dashboardUrl}`,
  ].join("\n");

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
