"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useJob, useStartRun } from "@/lib/client/hooks";
import { useRunPolling } from "@/lib/client/use-run-polling";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";
import type { EncodeRun } from "@/lib/types";

// The header (title, source URL, status badge, loading and not-found states) is provided.
//
// ---------------------------------------------------------------------------
// TASK 5 — TODO(candidate): build the run panel where the placeholder is.
// ---------------------------------------------------------------------------
//
// State model: a single discriminated union — "idle" | "running" | "failed" | "completed".
// This makes `isRunning && isFailed` impossible to express, not just unlikely.

// ── Discriminated union ────────────────────────────────────────────────────
type RunPanelMode =
  | { mode: "idle" }
  | { mode: "running";   run: EncodeRun; log: string[] }
  | { mode: "failed";    run: EncodeRun; log: string[] }
  | { mode: "completed"; run: EncodeRun; log: string[] };

// ── Log helper ────────────────────────────────────────────────────────────
function RunLog({ log }: { log: string[] }) {
  if (log.length === 0) return null;
  return (
    <div className="rounded-md bg-neutral-50 border border-neutral-200 p-3">
      <p className="mb-1 text-xs font-medium text-neutral-400 uppercase tracking-wide">Log</p>
      <ul className="space-y-0.5">
        {log.map((msg, i) => (
          <li key={i} className="text-xs text-neutral-600 font-mono">
            {msg}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Run panel — all hooks live here so they're never called conditionally ──
function RunPanel({ jobId, onRunFinished }: { jobId: string; onRunFinished: () => void }) {
  const [runId, setRunId] = useState<string | null>(null);
  const startRun = useStartRun(jobId);
  const { run, polling, fetchError, log } = useRunPolling(runId, onRunFinished);

  // Derive one explicit mode from hook output
  const panelMode: RunPanelMode = (() => {
    if (!run)                      return { mode: "idle" };
    if (run.stage === "FAILED")    return { mode: "failed",    run, log };
    if (run.stage === "COMPLETED") return { mode: "completed", run, log };
    if (polling)                   return { mode: "running",   run, log };
    return { mode: "idle" };
  })();

  async function handleStart() {
    try {
      const { runId: newRunId } = await startRun.mutateAsync();
      setRunId(newRunId);
    } catch {
      // startRun.error is set automatically by the mutation
    }
  }

  function handleRetry() {
    setRunId(null); // clear stale polling state before starting fresh
    handleStart();
  }

  return (
    <div className="rounded-md border border-neutral-200 p-4 space-y-4">

      {/* ── IDLE ── */}
      {panelMode.mode === "idle" && (
        <div className="space-y-2">
          <button
            id="start-encode-btn"
            onClick={handleStart}
            disabled={startRun.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {startRun.isPending ? "Starting…" : "Start encode"}
          </button>
          {startRun.isError && (
            <p className="text-sm text-red-600">
              {startRun.error instanceof Error ? startRun.error.message : "Failed to start encode"}
            </p>
          )}
          <p className="text-sm text-neutral-400">Press "Start encode" to begin transcoding.</p>
        </div>
      )}

      {/* ── RUNNING ── */}
      {panelMode.mode === "running" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge value={panelMode.run.stage} />
            <span className="text-sm text-neutral-500">{panelMode.run.progressPct}%</span>
          </div>
          <ProgressBar value={panelMode.run.progressPct} />
          <RunLog log={panelMode.log} />
          {fetchError && <p className="text-sm text-red-600">Poll error: {fetchError}</p>}
        </div>
      )}

      {/* ── FAILED ── */}
      {panelMode.mode === "failed" && (
        <div className="space-y-3">
          <ProgressBar value={panelMode.run.progressPct} failed />
          <div className="rounded-md bg-red-50 border border-red-200 p-3 space-y-2">
            <p className="text-sm font-medium text-red-700">Encode failed</p>
            {panelMode.run.error && (
              <p className="text-xs text-red-600">{panelMode.run.error}</p>
            )}
            <button
              id="retry-encode-btn"
              onClick={handleRetry}
              disabled={startRun.isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {startRun.isPending ? "Starting…" : "Retry"}
            </button>
          </div>
          <RunLog log={panelMode.log} />
        </div>
      )}

      {/* ── COMPLETED ── */}
      {panelMode.mode === "completed" && (
        <div className="space-y-3">
          <ProgressBar value={100} />
          <div className="flex items-center gap-3">
            <StatusBadge value={panelMode.run.stage} />
            {panelMode.run.result && (
              <span className="text-sm text-neutral-500">
                Completed in {panelMode.run.result.durationSec}s
              </span>
            )}
          </div>
          {panelMode.run.result && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                  <th className="py-1 pr-4 font-medium">Label</th>
                  <th className="py-1 pr-4 font-medium">Resolution</th>
                  <th className="py-1 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {panelMode.run.result.renditions.map((r) => (
                  <tr key={r.label} className="border-b border-neutral-100">
                    <td className="py-1 pr-4">{r.label}</td>
                    <td className="py-1 pr-4">{r.width}×{r.height}</td>
                    <td className="py-1">{r.sizeMb} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <RunLog log={panelMode.log} />
        </div>
      )}
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────
export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const jobQuery = useJob(id);

  if (jobQuery.isLoading) {
    return <p className="text-sm text-neutral-500">Loading job…</p>;
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <div className="text-sm text-red-600">
        Job not found.{" "}
        <Link href="/jobs" className="underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  const job = jobQuery.data;

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="text-sm text-neutral-500 hover:underline">
        ← All jobs
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{job.title}</h1>
          <p className="truncate text-sm text-neutral-500">{job.sourceUrl}</p>
        </div>
        <StatusBadge value={job.status} />
      </div>

      <RunPanel jobId={id} onRunFinished={() => jobQuery.refetch()} />
    </div>
  );
}
