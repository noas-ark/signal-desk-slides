"use client";

import { useEffect, useState, useCallback } from "react";

function severityPill(score) {
  if (score >= 8) return "high";
  if (score >= 5) return "med";
  return "low";
}

function timeAgo(iso) {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ClusterTable({ clusters, emptyLabel }) {
  if (clusters.length === 0) {
    return <div className="empty-state">{emptyLabel}</div>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cluster</th>
            <th>Frequency</th>
            <th>Severity</th>
            <th>Concentrated in</th>
            <th>Workaround seen?</th>
          </tr>
        </thead>
        <tbody>
          {clusters.map((c, i) => (
            <tr key={i}>
              <td>
                <strong>{c.cluster}</strong>
                {c.description && (
                  <p style={{ marginTop: 6, fontSize: "0.84rem", color: "var(--ink-muted)" }}>
                    {c.description}
                  </p>
                )}
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                  {(c.items || []).slice(0, 3).map((it, j) => (
                    <a
                      key={j}
                      href={it.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "0.78rem", color: "var(--ink-muted)" }}
                    >
                      {it.source}: {it.title}
                    </a>
                  ))}
                </div>
              </td>
              <td>
                <span className={`pill ${severityPill(c.frequency * 2)}`}>
                  {c.frequency}/5
                </span>
              </td>
              <td>
                <span className={`pill ${severityPill(c.severity * 2)}`}>
                  {c.severity}/5
                </span>
              </td>
              <td>{c.concentratedIn}</td>
              <td>{c.hasWorkaround ? "Yes" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState(null);
  const [draftState, setDraftState] = useState({});

  const [problemArea, setProblemArea] = useState("");
  const [exploring, setExploring] = useState(false);
  const [exploreResult, setExploreResult] = useState(null);
  const [exploreError, setExploreError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/results", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch (err) {
      setScanMessage(`Failed to load results: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runScan() {
    setScanning(true);
    setScanMessage(null);
    try {
      const res = await fetch("/api/scan");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "scan failed");
      setScanMessage(
        `Scan complete: ${json.newItemCount} fetched, ${json.clusterCount} clusters, ${json.draftCount} drafts.`
      );
      await load();
    } catch (err) {
      setScanMessage(`Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  }

  async function runExplore(e) {
    e.preventDefault();
    if (!problemArea.trim()) return;
    setExploring(true);
    setExploreError(null);
    setExploreResult(null);
    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemArea: problemArea.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "explore failed");
      setExploreResult(json);
    } catch (err) {
      setExploreError(err.message);
    } finally {
      setExploring(false);
    }
  }

  const clusters = data?.clusters || [];
  const drafts = data?.drafts || [];
  const errors = data?.errors || [];

  return (
    <main>
      <div className="page-header">
        <span className="eyebrow">Signal Desk &middot; Live</span>
        <h1>The real pipeline, running</h1>
        <p>
          This page is fed by a scheduled job that scans GitHub Issues,
          Hacker News, Reddit, Stack Overflow, and dev.to, clusters them
          with Claude, and drafts (never sends) outreach for the top items.
        </p>
        <div className="status-row">
          <span>
            Last updated:{" "}
            <span className="mono">
              {data?.updatedAt ? timeAgo(data.updatedAt) : "never — run a scan"}
            </span>
          </span>
          <button className="btn primary" onClick={runScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run scan now"}
          </button>
          <button className="btn" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
        {scanMessage && <div className="error-box">{scanMessage}</div>}
        {errors.length > 0 && (
          <div className="error-box">
            {errors.length} source/model error(s) on last run — check server
            logs. Results below reflect whatever succeeded.
          </div>
        )}
      </div>

      <section className="block">
        <h2>Explore a problem area</h2>
        <p className="lede">
          Type any problem area and Claude will generate real search
          queries, fetch live items for them, and cluster the results into
          sub-problem opportunities — on demand, separate from the
          scheduled scan above.
        </p>
        <form onSubmit={runExplore} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            type="text"
            value={problemArea}
            onChange={(e) => setProblemArea(e.target.value)}
            placeholder="e.g. AI customer support agents, browser automation tools…"
            style={{
              flex: "1 1 320px",
              padding: "9px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontFamily: "inherit",
              fontSize: "0.9rem",
              background: "var(--surface)",
              color: "var(--ink)",
            }}
          />
          <button className="btn primary" type="submit" disabled={exploring}>
            {exploring ? "Exploring…" : "Find sub-problems"}
          </button>
        </form>

        {exploreError && <div className="error-box">{exploreError}</div>}

        {exploreResult && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: "0.85rem", color: "var(--ink-muted)" }}>
              Searched {exploreResult.queries.length} generated queries
              (
              <span className="mono" style={{ fontSize: "0.78rem" }}>
                {exploreResult.queries.join(" · ")}
              </span>
              ), found {exploreResult.itemCount} items, clustered into{" "}
              {exploreResult.clusters.length} sub-problem area
              {exploreResult.clusters.length === 1 ? "" : "s"}.
            </p>
            <ClusterTable
              clusters={exploreResult.clusters}
              emptyLabel={
                exploreResult.note || "No sub-problems found for this area."
              }
            />
          </div>
        )}
      </section>

      <section className="block">
        <h2>Problem-opportunity matrix</h2>
        <p className="lede">
          Live clusters from the most recent scheduled scan, ranked by
          frequency + severity.
        </p>
        <ClusterTable
          clusters={clusters}
          emptyLabel='No clusters yet. Click "Run scan now" to fetch and cluster real items.'
        />
      </section>

      <section className="block">
        <h2>Alert feed &middot; drafted outreach</h2>
        <p className="lede">
          Real complaints, real Claude-drafted replies. Nothing here is ever
          sent automatically — approve/discard is a human decision, logged
          only in your browser for this demo.
        </p>
        {drafts.length === 0 ? (
          <div className="empty-state">
            No drafts yet. Run a scan to generate real drafted replies for
            the top items found.
          </div>
        ) : (
          <div className="alert-feed">
            {drafts.map((d) => {
              const status = draftState[d.itemId] || "pending";
              return (
                <div className="alert-card" key={d.itemId}>
                  <div className="alert-top">
                    <span className="alert-src">
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        {d.source}
                      </a>
                    </span>
                    <span className={`status-badge ${status}`}>
                      {status === "pending"
                        ? "Awaiting review"
                        : status === "approved"
                        ? "Approved by founder, ready to send"
                        : "Discarded"}
                    </span>
                  </div>
                  <div className="alert-title">{d.title}</div>
                  <div className="draft-panel">
                    <div className="draft-msg">{d.draft}</div>
                    <div className="alert-actions">
                      <button
                        className="btn primary"
                        onClick={() =>
                          setDraftState((s) => ({ ...s, [d.itemId]: "approved" }))
                        }
                      >
                        Approve to send
                      </button>
                      <button
                        className="btn"
                        onClick={() =>
                          setDraftState((s) => ({ ...s, [d.itemId]: "discarded" }))
                        }
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
