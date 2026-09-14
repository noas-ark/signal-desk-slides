import { loadResults } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const results = await loadResults();
  if (!results) {
    return Response.json({
      updatedAt: null,
      items: [],
      clusters: [],
      drafts: [],
      errors: [],
    });
  }
  return Response.json(results);
}
