import { describe, expect, it } from "vitest";
import { computeRun, FAIL_URL, type RunRecord } from "@/lib/server/store";
import { TIMELINE } from "@/lib/types";

describe("computeRun", () => {
  const baseStartedAt = 1_000_000;
  const normalRecord: RunRecord = {
    id: "r_12345678",
    jobId: "j_12345678",
    sourceUrl: "https://cdn.example.com/videos/clip.mp4",
    startedAt: baseStartedAt,
  };

  const corruptRecord: RunRecord = {
    id: "r_corrupt1",
    jobId: "j_corrupt1",
    sourceUrl: FAIL_URL,
    startedAt: baseStartedAt,
  };

  describe("stage boundaries for a normal run", () => {
    it("is QUEUED at elapsed = 0ms with 0% progress and no result or error", () => {
      const run = computeRun(normalRecord, baseStartedAt);
      expect(run.stage).toBe("QUEUED");
      expect(run.progressPct).toBe(0);
      expect(run.message).toBeTruthy();
      expect(run.result).toBeUndefined();
      expect(run.error).toBeUndefined();
    });

    it("is QUEUED just before 2000ms", () => {
      const run = computeRun(normalRecord, baseStartedAt + TIMELINE.queuedEndsMs - 1);
      expect(run.stage).toBe("QUEUED");
      expect(run.result).toBeUndefined();
      expect(run.error).toBeUndefined();
    });

    it("transitions to DOWNLOADING exactly on the 2000ms boundary", () => {
      const run = computeRun(normalRecord, baseStartedAt + TIMELINE.queuedEndsMs);
      expect(run.stage).toBe("DOWNLOADING");
      expect(run.result).toBeUndefined();
      expect(run.error).toBeUndefined();
    });

    it("is DOWNLOADING just before 6000ms", () => {
      const run = computeRun(normalRecord, baseStartedAt + TIMELINE.downloadingEndsMs - 1);
      expect(run.stage).toBe("DOWNLOADING");
      expect(run.result).toBeUndefined();
      expect(run.error).toBeUndefined();
    });

    it("transitions to TRANSCODING exactly on the 6000ms boundary", () => {
      const run = computeRun(normalRecord, baseStartedAt + TIMELINE.downloadingEndsMs);
      expect(run.stage).toBe("TRANSCODING");
      expect(run.result).toBeUndefined();
      expect(run.error).toBeUndefined();
    });

    it("is TRANSCODING just before 12000ms", () => {
      const run = computeRun(normalRecord, baseStartedAt + TIMELINE.transcodingEndsMs - 1);
      expect(run.stage).toBe("TRANSCODING");
      expect(run.result).toBeUndefined();
      expect(run.error).toBeUndefined();
    });

    it("transitions to COMPLETED exactly on the 12000ms boundary with 100% progress and result", () => {
      const run = computeRun(normalRecord, baseStartedAt + TIMELINE.transcodingEndsMs);
      expect(run.stage).toBe("COMPLETED");
      expect(run.progressPct).toBe(100);
      expect(run.result).toBeDefined();
      expect(run.result?.renditions.length).toBeGreaterThan(0);
      expect(run.error).toBeUndefined();
    });

    it("remains COMPLETED and capped at 100% when elapsed is well past 12000ms", () => {
      const run = computeRun(normalRecord, baseStartedAt + 25_000);
      expect(run.stage).toBe("COMPLETED");
      expect(run.progressPct).toBe(100);
      expect(run.result).toBeDefined();
      expect(run.error).toBeUndefined();
    });
  });

  describe("corrupt source URL failure handling", () => {
    it("behaves normally before 8000ms even with corrupt URL", () => {
      const queuedRun = computeRun(corruptRecord, baseStartedAt + 1000);
      expect(queuedRun.stage).toBe("QUEUED");
      expect(queuedRun.error).toBeUndefined();

      const downloadingRun = computeRun(corruptRecord, baseStartedAt + 4000);
      expect(downloadingRun.stage).toBe("DOWNLOADING");
      expect(downloadingRun.error).toBeUndefined();

      const transcodingRun = computeRun(corruptRecord, baseStartedAt + TIMELINE.failAtMs - 1);
      expect(transcodingRun.stage).toBe("TRANSCODING");
      expect(transcodingRun.error).toBeUndefined();
    });

    it("transitions to FAILED exactly on the 8000ms boundary with an error message and no result", () => {
      const run = computeRun(corruptRecord, baseStartedAt + TIMELINE.failAtMs);
      expect(run.stage).toBe("FAILED");
      expect(typeof run.error).toBe("string");
      expect(run.error?.length).toBeGreaterThan(0);
      expect(run.result).toBeUndefined();
    });

    it("freezes progress on FAILED and does NOT complete even when elapsed >= 12000ms", () => {
      const atFailTime = computeRun(corruptRecord, baseStartedAt + TIMELINE.failAtMs);
      const longAfterFail = computeRun(corruptRecord, baseStartedAt + 30_000);

      expect(longAfterFail.stage).toBe("FAILED");
      expect(longAfterFail.error).toBeDefined();
      expect(longAfterFail.result).toBeUndefined();
      // Progress must be frozen where it got to (at 8s), never reaching 100
      expect(longAfterFail.progressPct).toBe(atFailTime.progressPct);
      expect(longAfterFail.progressPct).toBeLessThan(100);
      expect(longAfterFail.progressPct).toBeGreaterThanOrEqual(66);
    });

    it("normal source URL does NOT fail at or after 8000ms", () => {
      const at8s = computeRun(normalRecord, baseStartedAt + TIMELINE.failAtMs);
      expect(at8s.stage).toBe("TRANSCODING");
      expect(at8s.error).toBeUndefined();

      const at12s = computeRun(normalRecord, baseStartedAt + TIMELINE.transcodingEndsMs);
      expect(at12s.stage).toBe("COMPLETED");
      expect(at12s.error).toBeUndefined();
    });
  });

  describe("progress monotonicity and clock skew edge cases", () => {
    it("handles clock skew where now is before startedAt gracefully", () => {
      const run = computeRun(normalRecord, baseStartedAt - 5000);
      expect(run.stage).toBe("QUEUED");
      expect(run.progressPct).toBe(0);
      expect(run.result).toBeUndefined();
      expect(run.error).toBeUndefined();
    });

    it("progress percentage never goes backwards over time", () => {
      const times = [0, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 15000];
      let previousPct = -1;

      for (const t of times) {
        const run = computeRun(normalRecord, baseStartedAt + t);
        expect(run.progressPct).toBeGreaterThanOrEqual(previousPct);
        expect(run.progressPct).toBeLessThanOrEqual(100);
        previousPct = run.progressPct;
      }
    });
  });
});
