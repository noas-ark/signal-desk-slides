import { loadResults } from "@/lib/store";
import { notifyDiscord } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Manually re-sends the current (already-scanned) results to Discord,
// without re-running the scan. Lets you push the existing matrix/drafts
// to the channel on demand — e.g. right before a live demo.
export async function POST(request) {
  const results = await loadResults();
  if (!results || !results.clusters || results.clusters.length === 0) {
    return Response.json(
      { error: "No scan results yet — run a scan first." },
      { status: 400 }
    );
  }

  try {
    const outcome = await notifyDiscord({
      clusters: results.clusters,
      draftCount: (results.drafts || []).length,
      dashboardUrl: new URL(request.url).origin,
    });
    if (!outcome.sent) {
      return Response.json({ error: outcome.reason || "Not sent" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
