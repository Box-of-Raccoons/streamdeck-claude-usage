import { describe, expect, it } from "vitest";

import { parseResetText, parseTapFile, parseUsageText, pickCurrent, type Reading } from "../src/usage.js";

const at = (iso: string) => new Date(iso);
const sec = (iso: string) => Date.parse(iso) / 1000;

// Real output of `claude -p /usage` on 2.1.286, 2026-10-01 10:24 EDT.
const SAMPLE = `You are currently using your subscription to power your Claude Code usage

Current session: 3% used · resets Oct 1 at 1:30pm (America/Indianapolis)
Current week (all models): 9% used · resets Oct 3 at 7am (America/Indianapolis)
Current week (Fable): 2% used · resets Oct 3 at 7am (America/Indianapolis)

What's contributing to your limits usage?
Last 24h · 201 requests · 19 sessions
  46% of your usage was at >150k context
`;

describe("parseUsageText", () => {
	it("reads both windows from real output and ignores the per-model week", () => {
		const now = at("2026-10-01T14:24:00Z");
		expect(parseUsageText(SAMPLE, now)).toEqual({
			five_hour: { pct: 3, resetsAt: sec("2026-10-01T17:30:00Z"), capturedAt: sec("2026-10-01T14:24:00Z") },
			seven_day: { pct: 9, resetsAt: sec("2026-10-03T11:00:00Z"), capturedAt: sec("2026-10-01T14:24:00Z") },
		});
	});

	it("keeps the percentage when the reset part is unreadable or missing", () => {
		const text = "Current session: 12.5% used · resets sometime soon\nCurrent week (all models): 40% used";
		const r = parseUsageText(text, at("2026-10-01T14:24:00Z"));
		expect(r.five_hour).toMatchObject({ pct: 12.5, resetsAt: null });
		expect(r.seven_day).toMatchObject({ pct: 40, resetsAt: null });
	});

	it("returns nothing for text that isn't usage", () => {
		expect(parseUsageText("You are using an API key.\nNo limits apply.", new Date())).toEqual({});
		expect(parseUsageText("", new Date())).toEqual({});
	});
});

describe("parseResetText", () => {
	const now = at("2026-10-01T14:24:00Z"); // 10:24 EDT

	it("converts from the named zone", () => {
		expect(parseResetText("Oct 1 at 1:30pm (America/Indianapolis)", now)).toBe(sec("2026-10-01T17:30:00Z"));
		expect(parseResetText("Oct 3 at 7am (America/Los_Angeles)", now)).toBe(sec("2026-10-03T14:00:00Z"));
		expect(parseResetText("Oct 3 at 12am (UTC)", now)).toBe(sec("2026-10-03T00:00:00Z"));
		expect(parseResetText("Oct 3 at 12pm (UTC)", now)).toBe(sec("2026-10-03T12:00:00Z"));
	});

	it("uses the zone's DST offset on the reset date, not today's", () => {
		// Nov 2 2026 is after US DST ends (Nov 1): Indianapolis is UTC-5 then.
		expect(parseResetText("Nov 2 at 7am (America/Indianapolis)", now)).toBe(sec("2026-11-02T12:00:00Z"));
	});

	it("rolls into next year across New Year", () => {
		expect(parseResetText("Jan 2 at 7am (UTC)", at("2026-12-31T20:00:00Z"))).toBe(sec("2027-01-02T07:00:00Z"));
	});

	it("takes a bare time as the next one", () => {
		expect(parseResetText("3pm (UTC)", at("2026-10-01T14:00:00Z"))).toBe(sec("2026-10-01T15:00:00Z"));
		expect(parseResetText("1pm (UTC)", at("2026-10-01T14:00:00Z"))).toBe(sec("2026-10-02T13:00:00Z"));
	});

	it("returns null for text it can't read", () => {
		expect(parseResetText("in 3 hours", now)).toBeNull();
		expect(parseResetText("Foo 3 at 7am", now)).toBeNull();
	});
});

describe("parseTapFile", () => {
	it("reads the statusline's rate_limits shape", () => {
		const r = parseTapFile({
			captured_at: 1000,
			five_hour: { used_percentage: 42, resets_at: 5000 },
			seven_day: { used_percentage: 7.5, resets_at: 9000 },
		});
		expect(r).toEqual({
			five_hour: { pct: 42, resetsAt: 5000, capturedAt: 1000 },
			seven_day: { pct: 7.5, resetsAt: 9000, capturedAt: 1000 },
		});
	});

	it("skips windows without a number and rejects files without captured_at", () => {
		expect(parseTapFile({ captured_at: 1, five_hour: { used_percentage: null }, seven_day: null })).toEqual({});
		expect(parseTapFile({ five_hour: { used_percentage: 4 } })).toBeNull();
		expect(parseTapFile("nope")).toBeNull();
		expect(parseTapFile(null)).toBeNull();
	});
});

describe("pickCurrent", () => {
	const r = (pct: number, resetsAt: number | null, capturedAt = 100): Reading => ({ pct, resetsAt, capturedAt });
	const now = 1000;

	it("takes the highest reading in the current window, not the newest", () => {
		// an idle session re-reports its older, lower number after a busy one
		const best = pickCurrent([r(40, 5000, 900), r(30, 5000, 950)], now);
		expect(best).toEqual({ pct: 40, resetsAt: 5000, capturedAt: 950 });
	});

	it("treats reset times a few minutes apart as the same window", () => {
		expect(pickCurrent([r(40, 5000), r(45, 5000 - 300)], now)?.pct).toBe(45);
	});

	it("drops readings from a window that has already reset", () => {
		expect(pickCurrent([r(80, 900), r(5, 19000)], now)?.pct).toBe(5);
		expect(pickCurrent([r(80, 900)], now)).toBeNull();
		expect(pickCurrent([r(80, now)], now)).toBeNull();
	});

	it("prefers a newer window over a higher number from an older one", () => {
		expect(pickCurrent([r(90, 5000), r(2, 5000 + 18000)], now)?.pct).toBe(2);
	});

	it("uses undated readings only when nothing dated is current", () => {
		expect(pickCurrent([r(50, null, 900), r(20, 5000, 100)], now)?.pct).toBe(20);
		expect(pickCurrent([r(50, null, 900), r(60, null, 800)], now)?.pct).toBe(50);
	});

	it("returns null for no readings", () => {
		expect(pickCurrent([], now)).toBeNull();
	});
});
