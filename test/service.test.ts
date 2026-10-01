import { mkdtempSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { POLL_GAP_EMPTY_SECONDS, POLL_GAP_SECONDS, shouldPoll, TAP_FRESH_SECONDS, UsageService, type PollState } from "../src/service.js";
import { readTapDir, type TapScan } from "../src/sources.js";
import { openArgs } from "../src/launch.js";

const NOW = 1_000_000;

describe("shouldPoll", () => {
	const base: PollState = { newestTapCapture: NOW - 5, lastPollAt: null, pollInFlight: false, haveAll: true };

	it("stays quiet while the tap is fresh and both windows have values", () => {
		expect(shouldPoll(base, NOW)).toBe(false);
	});

	it("polls once the tap goes stale, then waits the gap", () => {
		const stale = { ...base, newestTapCapture: NOW - TAP_FRESH_SECONDS };
		expect(shouldPoll(stale, NOW)).toBe(true);
		expect(shouldPoll({ ...stale, lastPollAt: NOW - POLL_GAP_SECONDS + 1 }, NOW)).toBe(false);
		expect(shouldPoll({ ...stale, lastPollAt: NOW - POLL_GAP_SECONDS }, NOW)).toBe(true);
	});

	it("polls without a tap at all (the out-of-the-box case)", () => {
		expect(shouldPoll({ ...base, newestTapCapture: null }, NOW)).toBe(true);
	});

	it("polls even with a fresh tap when a window is missing, and retries sooner", () => {
		const missing = { ...base, haveAll: false };
		expect(shouldPoll(missing, NOW)).toBe(true);
		expect(shouldPoll({ ...missing, lastPollAt: NOW - POLL_GAP_EMPTY_SECONDS }, NOW)).toBe(true);
		expect(shouldPoll({ ...missing, lastPollAt: NOW - POLL_GAP_EMPTY_SECONDS + 1 }, NOW)).toBe(false);
	});

	it("never starts a second poll while one runs", () => {
		expect(shouldPoll({ ...base, newestTapCapture: null, pollInFlight: true }, NOW)).toBe(false);
	});
});

const emptyScan = (): TapScan => ({ readings: { five_hour: [], seven_day: [] }, newestCapture: null });

describe("UsageService", () => {
	const usageText = "Current session: 33% used · resets Oct 1 at 1:30pm (UTC)\nCurrent week (all models): 61% used · resets Oct 3 at 7am (UTC)";
	const now = () => new Date("2026-10-01T12:00:00Z");
	const nowSec = Date.parse("2026-10-01T12:00:00Z") / 1000;

	it("falls back to /usage when there's no tap and publishes both windows", async () => {
		const runUsage = vi.fn(async () => usageText);
		const svc = new UsageService({ readTap: async () => emptyScan(), runUsage, now });
		const seen: unknown[] = [];
		svc.subscribe((s) => seen.push(s));
		await svc.tick();
		expect(runUsage).toHaveBeenCalledOnce();
		expect(svc.current).toEqual({ five_hour: 33, seven_day: 61 });
		expect(seen).toEqual([{ five_hour: 33, seven_day: 61 }]);
	});

	it("uses a fresh tap and doesn't run /usage", async () => {
		const scan = emptyScan();
		scan.readings.five_hour.push({ pct: 12, resetsAt: nowSec + 3600, capturedAt: nowSec - 10 });
		scan.readings.seven_day.push({ pct: 70, resetsAt: nowSec + 86400, capturedAt: nowSec - 10 });
		scan.newestCapture = nowSec - 10;
		const runUsage = vi.fn(async () => usageText);
		const svc = new UsageService({ readTap: async () => scan, runUsage, now });
		await svc.tick();
		expect(runUsage).not.toHaveBeenCalled();
		expect(svc.current).toEqual({ five_hour: 12, seven_day: 70 });
	});

	it("keeps showing -- when claude isn't installed or the poll fails", async () => {
		const log = vi.fn();
		for (const runUsage of [async () => null, async () => Promise.reject(new Error("boom"))]) {
			const svc = new UsageService({ readTap: async () => emptyScan(), runUsage, now, log });
			await svc.tick();
			expect(svc.current).toEqual({ five_hour: null, seven_day: null });
		}
		expect(log).toHaveBeenCalledTimes(2);
	});

	it("doesn't notify when nothing changed", async () => {
		const svc = new UsageService({ readTap: async () => emptyScan(), runUsage: async () => usageText, now });
		const fn = vi.fn();
		svc.subscribe(fn);
		await svc.tick();
		await svc.tick();
		expect(fn).toHaveBeenCalledOnce();
	});
});

describe("readTapDir", () => {
	const dir = () => mkdtempSync(path.join(tmpdir(), "tap-"));
	const nowSec = Date.now() / 1000;

	it("collects every session's file and the newest capture", async () => {
		const d = dir();
		writeFileSync(path.join(d, "a.json"), JSON.stringify({ captured_at: nowSec - 50, five_hour: { used_percentage: 10, resets_at: nowSec + 100 } }));
		writeFileSync(path.join(d, "b.json"), JSON.stringify({ captured_at: nowSec - 5, five_hour: { used_percentage: 20, resets_at: nowSec + 100 }, seven_day: { used_percentage: 3, resets_at: nowSec + 9000 } }));
		writeFileSync(path.join(d, "c.json.123.tmp"), "{ half written");
		writeFileSync(path.join(d, "d.json"), "{ broken");
		const scan = await readTapDir(d, nowSec);
		expect(scan.readings.five_hour.map((r) => r.pct).sort()).toEqual([10, 20]);
		expect(scan.readings.seven_day.map((r) => r.pct)).toEqual([3]);
		expect(scan.newestCapture).toBe(nowSec - 5);
	});

	it("treats a missing folder as no tap", async () => {
		expect(await readTapDir(path.join(dir(), "nope"), nowSec)).toEqual(emptyScan());
	});

	it("deletes files untouched for over 8 days", async () => {
		const d = dir();
		const old = path.join(d, "old.json");
		writeFileSync(old, JSON.stringify({ captured_at: 1, five_hour: { used_percentage: 99, resets_at: nowSec + 100 } }));
		const nineDaysAgo = nowSec - 9 * 86400;
		utimesSync(old, nineDaysAgo, nineDaysAgo);
		const scan = await readTapDir(d, nowSec);
		expect(scan.readings.five_hour).toEqual([]);
		expect(existsSync(old)).toBe(false);
	});
});

describe("openArgs", () => {
	it("opens the named app, defaulting to Claude", () => {
		expect(openArgs("Terminal")).toEqual(["-a", "Terminal"]);
		expect(openArgs("/Applications/Claude.app")).toEqual(["-a", "/Applications/Claude.app"]);
		expect(openArgs("  ")).toEqual(["-a", "Claude"]);
		expect(openArgs(undefined)).toEqual(["-a", "Claude"]);
	});
});
