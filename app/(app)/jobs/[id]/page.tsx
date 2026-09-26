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
// This is the most substantial screen in the exercise. Build it in this order:
//
//   1. A "Start encode" button that calls the provided useStartRun(job.id) mutation and keeps
//      the returned `runId` in state. Disable it while a run is in flight.
//
//   2. Live progress, driven by your useRunPolling(runId) hook:
//        - the current stage (<StatusBadge value={run.stage} />),
//        - a percentage bar (<ProgressBar value={run.progressPct} />),
//        - the log — the messages collected so far, newest last.
//      A run takes about 12 seconds, so you'll see the whole thing without waiting long.
//
//   3. The FAILED case. Create a job with the source URL
//        https://cdn.example.com/videos/corrupt.mp4
//      and it will fail partway. Show the error message clearly (a red panel, `failed` on the
//      progress bar) and offer a Retry that starts a fresh run.
//
//   4. The COMPLETED case. `run.result` arrives with the final poll: show the duration and a
//      small table of renditions (label / resolution / size). Plain and readable beats fancy.
//
// A note on state: at any moment this screen is in exactly one of — idle, running, failed,
// completed. Try to make that explicit in how you write it, rather than juggling several
// booleans that could contradict each other (`isRunning && isFailed` should be impossible to
// express, not merely unlikely). Say what you chose in the README.
//
// We are NOT grading visual design. Correct behaviour and readable code are what count.

// ── Discriminated union: exactly one mode at a time ───────────────────────
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
          <li key={i} className="text-xs text-neutral-600 font-mono">{msg}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Run panel (all hooks unconditional) ──────────────────────────────────
function RunPanel({ jobId, onRunFinished }: { jobId: string; onRunFinished: () => void }) {
  // 1. Keep the returned runId in state
  const [runId, setRunId] = useState<string | null>(null);
  const startRun = useStartRun(jobId);
  const { run, fetchError, log } = useRunPolling(runId, onRunFinished);

  // Single explicit mode — isRunning && isFailed is impossible to express
  const panelMode: RunPanelMode = (() => {
    if (run?.stage === "FAILED")    return { mode: "failed",    run, log };
    if (run?.stage === "COMPLETED") return { mode: "completed", run, log };
    if (run)                        return { mode: "running",   run, log };
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
    setRunId(null);   // drop stale run data
    handleStart();
  }

  return (
    <div className="rounded-md border border-neutral-200 p-4 space-y-4">

      {/* 1. IDLE — Start encode button */}
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
        </div>
      )}

      {/* 2. RUNNING — stage badge, progress bar, log */}
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

      {/* 3. FAILED — red panel, failed progress bar, Retry */}
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

      {/* 4. COMPLETED — duration + renditions table */}
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

// ── Page shell ────────────────────────────────────────────────────────────
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
        <Link href="/jobs" className="underline">Back to jobs</Link>
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
