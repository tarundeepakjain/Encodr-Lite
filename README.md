# Encodr Lite — Intern Take-Home
Thanks for giving me this opportunity, i really enjoyed this assignment.
Here is the short review what I had done and my thoughts on the tasks.

### What's working

All six tasks are complete:

- **Task 1 — Source URL validation:** `sourceUrlSchema` rejects empty strings, non-URLs, non-http(s) protocols, and URLs with no file path. Each case has its own user-facing message. The same schema runs in the browser (React Hook Form resolver) and on the server (API validation).
- **Task 2 — Jobs API routes:** `GET /api/jobs` returns the list sorted newest-first. `POST /api/jobs` validates with `createJobSchema`, returns a 422 with per-field errors on invalid input. Both routes require a valid auth token.
- **Task 3 — Run state machine:** `computeRun()` derives stage, progress, message, and result purely from elapsed time against `TIMELINE` constants. The corrupt URL fails at 8 s with an error message. Progress is capped at 100 on completion and frozen at the failure point for FAILED runs.
- **Task 4 — Create-job form:** React Hook Form + `zodResolver(createJobSchema)`. Field errors shown inline. 422 field errors from the server are mapped back onto the right fields via `setError`. Button disabled while the request is in flight; form resets on success.
- **Task 5 — Live polling + detail page:** `useRunPolling` polls `GET /api/runs/:id` once per second. Stops when the stage is terminal. `onFinished` triggers a job refetch so the status badge updates. The detail page uses a discriminated union for state (see Decisions below).
- **Task 6 — Tests:** `computeRun` is tested at every stage boundary (exactly on the boundary and just before it), including the corrupt-URL FAILED case. `sourceUrlSchema` is tested for a valid URL and each rejection case.

### How to see the failure path

1. Sign in and create a job with source URL `https://cdn.example.com/videos/corrupt.mp4`.
2. Open the job's detail page and click **Start encode**.
3. The run progresses through QUEUED → DOWNLOADING → TRANSCODING, then fails at ~8 seconds.
4. A red panel shows the error message and a **Retry** button to start a fresh run.

### Decisions and assumptions

**Detail page state model:** Instead of several booleans (`isRunning`, `isFailed`, etc.), I used a single TypeScript discriminated union:

```ts
type RunPanelMode =
  | { mode: "idle" }
  | { mode: "running";   run: EncodeRun; log: string[] }
  | { mode: "failed";    run: EncodeRun; log: string[] }
  | { mode: "completed"; run: EncodeRun; log: string[] };
```

This makes `isRunning && isFailed` impossible to express at the type level, not just unlikely at runtime. The mode is derived from `run.stage` (the server's answer), not from the `polling` flag, because the polling flag can briefly be `false` between cleanup and the next effect run even when the run is still in a non-terminal stage.

**Polling cleanup:** Two separate problems solved in the `useEffect` cleanup:
- `clearInterval(id)` stops future ticks from firing.
- `cancelled = true` guards any fetch that was already in-flight when the component unmounted — its promise will still resolve, but the flag stops it from calling `setState` on an unmounted component.

**`onFinished` in a ref:** Passed in a `useRef` rather than adding it to the `useEffect` dependency array. An inline arrow function from the parent gets a new reference on every render; putting it in deps would restart the interval on every render.

**Log deduplication:** Each poll returns the same `run.message` for the duration of a stage (e.g., "Downloading source media file…" appears for 4 seconds = ~4 polls). The hook compares incoming message to `log[log.length - 1]` and only appends if they differ.

### What was hardest

The two-part cleanup in `useRunPolling` was the trickiest part. I initially only added `clearInterval`, which stops future ticks but doesn't help with a fetch already in-flight. A request that started just before unmount will still resolve, and calling `setState` on an unmounted component at that point causes a stale update. Reading the React docs on `useEffect` cleanup and testing by navigating away mid-run (watching the console logs stop) confirmed both guards were necessary.

### What I'd do next

- **Auto-resume polling on navigation back.** Currently if you navigate away mid-run and return, the panel resets to idle even though `job.latestRunId` and `job.status = "RUNNING"` are available. Seeding `runId` from `job.latestRunId` on mount would fix this.
- **Pause polling when the tab is hidden** using `document.visibilityState` to save unnecessary requests.
- **Tests for the create-job form** — submitting with an invalid URL should show an error and not call the API.

### Time spent

~4 hours.
