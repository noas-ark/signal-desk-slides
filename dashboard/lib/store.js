// Serverless functions are stateless between invocations, so the scan
// results are persisted to Vercel Blob (a fixed, overwritable pathname)
// and read back by the dashboard and the /api/results route.

import { put, head } from "@vercel/blob";

const PATHNAME = "signal-desk/latest.json";

export async function saveResults(data) {
  await put(PATHNAME, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function loadResults() {
  try {
    const blob = await head(PATHNAME);
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err?.message?.includes("not_found") || err?.status === 404) {
      return null;
    }
    console.error("loadResults failed:", err.message);
    return null;
  }
}
