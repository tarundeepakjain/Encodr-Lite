import { json, readJson, validationError, withAuth } from "@/lib/server/http";
import { createJobSchema } from "@/lib/schemas";
import { createJob, listJobs } from "@/lib/server/store";

// ---------------------------------------------------------------------------
// TASK 2 — TODO(candidate): implement both handlers.
// ---------------------------------------------------------------------------
//
// Look at app/api/jobs/[id]/route.ts first — it's a complete, working example of the pattern.
// The helpers you need are all in lib/server/http.ts: withAuth, json, error, readJson,
// validationError. The store functions are listJobs() and createJob() in lib/server/store.ts.
//
// GET /api/jobs
//   - signed-in only (401 otherwise),
//   - returns the array of jobs.
//
// POST /api/jobs
//   - signed-in only (401 otherwise),
//   - body is { sourceUrl: string, title?: string },
//   - validate it with createJobSchema — the SAME schema the browser form uses. This matters:
//     a request can reach this route without ever going through your form (curl, Postman, a bug),
//     so the server must check for itself. Never trust the client.
//   - on invalid input, return validationError(parsed.error) — a 422 whose body carries per-field
//     messages, which is what Task 4's form maps back onto its inputs.
//   - on success, create the job and return it with status 201.
//
// You can check your work without any UI:
//   curl -i localhost:3000/api/jobs                                  # expect 401
//   TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' \
//     -d '{"email":"demo@encodr.dev","password":"password123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
//   curl -i localhost:3000/api/jobs -H "authorization: Bearer $TOKEN"                 # expect 200 []
//   curl -i localhost:3000/api/jobs -H "authorization: Bearer $TOKEN" \
//     -H 'content-type: application/json' -d '{"sourceUrl":"nope"}'                   # expect 422

export async function GET(req: Request) {
  return withAuth(req, () => {
    return json(listJobs());
  });
}

export async function POST(req: Request) {
  return withAuth(req, async () => {
    const parsed = createJobSchema.safeParse(await readJson(req));
    if (!parsed.success) return validationError(parsed.error);

    const job = createJob(parsed.data);
    return json(job, 201);
  });
}
