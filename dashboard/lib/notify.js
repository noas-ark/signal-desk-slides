// Slide 04, step 03: "Notify team — ranked digest posted to Slack, tagged
// by cluster and score." Optional — a no-op if SLACK_WEBHOOK_URL isn't set,
// so scans still work before you wire this up.

export async function notifySlack({ clusters, draftCount, dashboardUrl }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "SLACK_WEBHOOK_URL not set" };
  if (!clusters || clusters.length === 0) {
    return { sent: false, reason: "no clusters to report" };
  }

  const top = [...clusters]
    .sort((a, b) => b.frequency + b.severity - (a.frequency + a.severity))
    .slice(0, 5);

  const lines = top.map(
    (c, i) =>
      `${i + 1}. *${c.cluster}* — freq ${c.frequency}/5, severity ${c.severity}/5${
        c.concentratedIn ? ` (${c.concentratedIn})` : ""
      }`
  );

  const text = [
    `*Signal Desk scan complete* — ${clusters.length} clusters, ${draftCount} drafted replies awaiting review.`,
    "",
    ...lines,
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
