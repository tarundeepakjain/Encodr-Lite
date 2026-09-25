import { randomUUID } from "node:crypto";
import { TIMELINE, type EncodeResult, type EncodeRun, type Job, type JobStatus, type Stage } from "@/lib/types";

// Our "database" is two Maps held in memory. `next dev` is a single Node process, so this is fine
// for the exercise. Restarting the dev server wipes everything — that's expected, don't work around it.
//
// Everything in this file is provided EXCEPT computeRun(), which is Task 3.

const jobs = new Map<string, Job>();
const runs = new Map<string, RunRecord>();

export interface RunRecord {
  id: string;
  jobId: string;
  sourceUrl: string;
  /** epoch milliseconds — when Start encode was pressed. */
  startedAt: number;
}

/** The one "magic" source URL that always fails partway, so you can build the error path. */
export const FAIL_URL = "https://cdn.example.com/videos/corrupt.mp4";

// ---------------------------------------------------------------------------
// TASK 3 — the run state machine. This is the most interesting logic in the exercise.
// ---------------------------------------------------------------------------

/**
 * TODO(candidate): work out what state a run is in right now.
 *
 * There are no timers on the server. Instead, a run's state is a PURE FUNCTION of how much time
 * has passed since it started: `elapsed = now - record.startedAt`. Same inputs, same output, every
 * time — which is exactly why it's easy to unit-test (you pass in `now`, so no waiting around).
 *
 * Use the constants in TIMELINE (lib/types.ts) so your numbers match ours:
 *
 *   elapsed < 2000ms                  → stage "QUEUED"
 *   2000ms  ≤ elapsed < 6000ms        → stage "DOWNLOADING"
 *   6000ms  ≤ elapsed < 12000ms       → stage "TRANSCODING"
 *   elapsed ≥ 12000ms                 → stage "COMPLETED", and `result` is set (use makeResult())
 *
 *   EXCEPT: if record.sourceUrl === FAIL_URL and elapsed ≥ 8000ms, the run is "FAILED" with an
 *   `error` message explaining what went wrong. (Before 8000ms it behaves normally.)
 *
 * progressPct should be 0 at elapsed 0 and 100 once COMPLETED, and must never go backwards.
 * The simplest thing that works: scale elapsed across the whole 12s timeline. You do not need
 * per-stage percentages. For a FAILED run, freeze the percentage where it got to.
 *
 * `message` is one human-readable line for the UI's log, e.g. "Transcoding 1080p…".
 *
 * Return an EncodeRun (see lib/types.ts) — `error` only on FAILED, `result` only on COMPLETED.
 *
 * Suggested order of work: write the tests in __tests__/ first (one per stage boundary, one for
 * the failing URL), watch them fail, then make them pass.
 */
export function computeRun(record: RunRecord, now: number = Date.now()): EncodeRun {
  const elapsed = Math.max(0, now - record.startedAt);
  const totalMs = TIMELINE.transcodingEndsMs;

  let stage: Stage;
  let message: string;
  let error: string | undefined;
  let result: EncodeResult | undefined;
  let progressElapsed = Math.min(elapsed, totalMs);

  if (record.sourceUrl === FAIL_URL && elapsed >= TIMELINE.failAtMs) {
    stage = "FAILED";
    message = "Transcoding failed: corrupt source media";
    error = "Corrupt source file: stream decode error at 00:08";
    progressElapsed = TIMELINE.failAtMs;
  } else if (elapsed < TIMELINE.queuedEndsMs) {
    stage = "QUEUED";
    message = "Queued and waiting for an available worker…";
  } else if (elapsed < TIMELINE.downloadingEndsMs) {
    stage = "DOWNLOADING";
    message = "Downloading source media file…";
  } else if (elapsed < totalMs) {
    stage = "TRANSCODING";
    message = "Transcoding video into multiple renditions…";
  } else {
    stage = "COMPLETED";
    message = "Encode completed successfully";
    result = makeResult();
  }

  const progressPct = stage === "COMPLETED" ? 100 : Math.floor((progressElapsed / totalMs) * 100);

  return {
    id: record.id,
    jobId: record.jobId,
    stage,
    progressPct,
    message,
    ...(error ? { error } : {}),
    ...(result ? { result } : {}),
  };
}

// ---------------------------------------------------------------------------
// Everything below is provided.
// ---------------------------------------------------------------------------

/** Fake but plausible encode output. Call this when a run reaches COMPLETED. */
export function makeResult(): EncodeResult {
  return {
    durationSec: 184,
    renditions: [
      { label: "1080p", width: 1920, height: 1080, sizeMb: 142.6 },
      { label: "720p", width: 1280, height: 720, sizeMb: 68.3 },
      { label: "480p", width: 854, height: 480, sizeMb: 24.1 },
    ],
  };
}

export function listJobs(): Job[] {
  return [...jobs.values()]
    .map(withDerivedStatus)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | null {
  const job = jobs.get(id);
  return job ? withDerivedStatus(job) : null;
}

export function createJob(input: { sourceUrl: string; title?: string }): Job {
  const sourceUrl = input.sourceUrl.trim();
  const job: Job = {
    id: `j_${randomUUID().slice(0, 8)}`,
    title: input.title?.trim() || deriveTitle(sourceUrl),
    sourceUrl,
    status: "NEW",
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function startRun(jobId: string): RunRecord | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  const record: RunRecord = {
    id: `r_${randomUUID().slice(0, 8)}`,
    jobId,
    sourceUrl: job.sourceUrl,
    startedAt: Date.now(),
  };
  runs.set(record.id, record);
  job.latestRunId = record.id;
  return record;
}

export function getRun(id: string, now: number = Date.now()): EncodeRun | null {
  const record = runs.get(id);
  return record ? computeRun(record, now) : null;
}

/**
 * A job's status is derived from its latest run rather than stored, so it can never drift out of
 * sync. Once computeRun() works, job statuses in the list start updating for free.
 */
function withDerivedStatus(job: Job): Job {
  if (!job.latestRunId) return job;
  const record = runs.get(job.latestRunId);
  if (!record) return job;

  let status: JobStatus;
  try {
    const stage = computeRun(record).stage;
    status = stage === "COMPLETED" ? "COMPLETED" : stage === "FAILED" ? "FAILED" : "RUNNING";
  } catch {
    // computeRun isn't implemented yet — leave the stored status alone.
    return job;
  }
  return { ...job, status };
}

function deriveTitle(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Untitled encode";
  } catch {
    return "Untitled encode";
  }
}

/** Test helper — resets the store between tests. */
export function __resetStore() {
  jobs.clear();
  runs.clear();
}

export { TIMELINE };
