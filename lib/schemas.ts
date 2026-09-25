import { z } from "zod";

// These schemas are used in TWO places:
//   1. in the browser, as the React Hook Form resolver (instant inline errors), and
//   2. on the server, inside the API route (never trust the browser).
// Sharing them means one set of rules, and the same error messages in both places.

/**
 * TASK 1 — TODO(candidate): make this a real http(s) media-URL check.
 *
 * Right now it accepts any non-empty string, which is not good enough.
 *
 * It should ACCEPT:
 *   https://cdn.example.com/videos/clip.mp4
 *   http://media.example.com/a/b/movie.mov
 *
 * It should REJECT (each with a message a user could act on):
 *   ""                                  → "Source URL is required"
 *   "not a url"                         → not a URL at all
 *   "ftp://cdn.example.com/clip.mp4"    → wrong protocol; only http and https
 *   "https://cdn.example.com"           → no file path, so there's nothing to encode
 *
 * Hints:
 *   - `new URL(value)` throws on strings that aren't URLs — wrap it in try/catch.
 *   - A parsed URL gives you `.protocol` (e.g. "https:") and `.pathname` (e.g. "/videos/clip.mp4").
 *   - Zod's `.refine((value) => boolean, { message })` is the tool for a custom rule. You can
 *     chain more than one refine, each with its own message.
 *   - Write the test for this FIRST — see __tests__/example.test.ts for the pattern.
 */
function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export const sourceUrlSchema = z
  .string()
  .min(1, "Source URL is required")
  .refine((val) => tryParseUrl(val) !== null, {
    message: "Enter a valid URL",
  })
  .refine(
    (val) => {
      const url = tryParseUrl(val);
      return !url || url.protocol === "http:" || url.protocol === "https:";
    },
    { message: "Only http(s) URLs are supported" },
  )
  .refine(
    (val) => {
      const url = tryParseUrl(val);
      return !url || (url.pathname !== "" && url.pathname !== "/");
    },
    { message: "URL must include a file path" },
  );

export const createJobSchema = z.object({
  sourceUrl: sourceUrlSchema,
  title: z
    .string()
    .trim()
    .max(80, "Keep the title under 80 characters")
    .optional()
    .or(z.literal("")),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

// Provided, and already used by the working sign-in page. Read it as a reference for the style
// we're after in sourceUrlSchema.
export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const startRunSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
});
