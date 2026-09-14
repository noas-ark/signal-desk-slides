import { expandProblemArea, clusterAndScore } from "@/lib/llm";
import { fetchQueryDrivenSources } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITEMS_FOR_CLUSTERING = 60;

// On-demand version of the scan pipeline: type any problem area, get its
// sub-problem clusters right now, nothing persisted. Two Claude calls
// (expand queries, then cluster/score) plus one fetch round — separate
// from the scheduled /api/scan run so it doesn't interfere with that data.
export async function POST(request) {
  let problemArea;
  try {
    const body = await request.json();
    problemArea = (body.problemArea || "").trim();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!problemArea) {
    return Response.json({ error: "problemArea is required" }, { status: 400 });
  }
  if (problemArea.length > 200) {
    return Response.json({ error: "problemArea too long (max 200 chars)" }, { status: 400 });
  }

  try {
    const queries = await expandProblemArea(problemArea);
    const items = await fetchQueryDrivenSources(queries);

    if (items.length === 0) {
      return Response.json({
        problemArea,
        queries,
        itemCount: 0,
        clusters: [],
        note: "No items found for the generated queries — try a more specific problem area.",
      });
    }

    const forClustering = [...items]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, MAX_ITEMS_FOR_CLUSTERING);
    const clusters = await clusterAndScore(forClustering);
    clusters.sort((a, b) => b.frequency + b.severity - (a.frequency + a.severity));

    return Response.json({
      problemArea,
      queries,
      itemCount: items.length,
      clusters,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
