import { describe, expect, it } from "vitest";
import { sourceUrlSchema } from "@/lib/schemas";

describe("sourceUrlSchema", () => {
  it("accepts valid http and https URLs with file paths", () => {
    expect(sourceUrlSchema.safeParse("https://cdn.example.com/videos/clip.mp4").success).toBe(true);
    expect(sourceUrlSchema.safeParse("http://media.example.com/a/b/movie.mov").success).toBe(true);
  });

  it("rejects empty strings", () => {
    const res = sourceUrlSchema.safeParse("");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe("Source URL is required");
    }
  });

  it("rejects invalid URLs", () => {
    const res = sourceUrlSchema.safeParse("not a url");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe("Enter a valid URL");
    }
  });

  it("rejects non-http(s) protocols", () => {
    const res = sourceUrlSchema.safeParse("ftp://cdn.example.com/clip.mp4");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe("Only http(s) URLs are supported");
    }
  });

  it("rejects URLs without a path", () => {
    const res = sourceUrlSchema.safeParse("https://cdn.example.com");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe("URL must include a file path");
    }

    const resSlash = sourceUrlSchema.safeParse("https://cdn.example.com/");
    expect(resSlash.success).toBe(false);
    if (!resSlash.success) {
      expect(resSlash.error.issues[0].message).toBe("URL must include a file path");
    }
  });
});
