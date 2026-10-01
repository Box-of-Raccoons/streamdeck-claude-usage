/**
 * Usage readings and how to combine them. Pure functions, no IO.
 *
 * A reading comes from one of two places: a statusline tap file (one per
 * Claude Code session) or the text of `claude -p /usage`. Several sessions
 * can report the same window at different moments, and an idle session keeps
 * re-reporting its last known number. Usage only rises inside a window, so
 * the highest percentage among readings for the current window is the truth.
 */

export type WindowKey = "five_hour" | "seven_day";
export const WINDOWS: readonly WindowKey[] = ["five_hour", "seven_day"];

export interface Reading {
	/** Percent used, as reported (may be fractional). */
	pct: number;
	/** When the window resets, epoch seconds; null when the source didn't say. */
	resetsAt: number | null;
	/** When this reading was taken, epoch seconds. */
	capturedAt: number;
}

export type Readings = Partial<Record<WindowKey, Reading>>;

/** Two readings whose reset times are this close belong to the same window. */
const SAME_WINDOW_SECONDS = 600;

/**
 * The best current value for one window, or null when nothing is current.
 * Readings for a window that has already reset are dropped. Readings that know
 * their reset time win over ones that don't.
 */
export function pickCurrent(readings: readonly Reading[], nowSec: number): Reading | null {
	const live = readings.filter((r) => Number.isFinite(r.pct) && (r.resetsAt == null || r.resetsAt > nowSec));
	const dated = live.filter((r) => r.resetsAt != null);
	if (dated.length > 0) {
		const latestReset = Math.max(...dated.map((r) => r.resetsAt as number));
		const current = dated.filter((r) => latestReset - (r.resetsAt as number) <= SAME_WINDOW_SECONDS);
		return {
			pct: Math.max(...current.map((r) => r.pct)),
			resetsAt: latestReset,
			capturedAt: Math.max(...current.map((r) => r.capturedAt)),
		};
	}
	if (live.length === 0) return null;
	return live.reduce((a, b) => (b.capturedAt > a.capturedAt ? b : a));
}

/**
 * Reads one statusline tap file: `{ captured_at, five_hour: { used_percentage, resets_at }, seven_day: {...} }`.
 * Returns null when the file isn't shaped like that.
 */
export function parseTapFile(json: unknown): Readings | null {
	if (!json || typeof json !== "object") return null;
	const obj = json as Record<string, unknown>;
	const capturedAt = obj.captured_at;
	if (typeof capturedAt !== "number" || !Number.isFinite(capturedAt)) return null;
	const out: Readings = {};
	for (const key of WINDOWS) {
		const w = obj[key];
		if (!w || typeof w !== "object") continue;
		const { used_percentage, resets_at } = w as Record<string, unknown>;
		if (typeof used_percentage !== "number" || !Number.isFinite(used_percentage)) continue;
		out[key] = {
			pct: used_percentage,
			resetsAt: typeof resets_at === "number" && Number.isFinite(resets_at) ? resets_at : null,
			capturedAt,
		};
	}
	return out;
}

const LINES: Record<WindowKey, RegExp> = {
	five_hour: /^\s*Current session:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*\S\s*resets\s+(.+?))?\s*$/m,
	seven_day: /^\s*Current week \(all models\):\s*(\d+(?:\.\d+)?)%\s*used(?:\s*\S\s*resets\s+(.+?))?\s*$/m,
};

/**
 * Parses the human text of `claude -p /usage`, e.g.
 * "Current session: 3% used · resets Oct 1 at 1:30pm (America/Indianapolis)".
 * Windows it can't find are left out; a reset time it can't read becomes null.
 */
export function parseUsageText(text: string, now: Date): Readings {
	const out: Readings = {};
	const capturedAt = Math.floor(now.getTime() / 1000);
	for (const key of WINDOWS) {
		const m = LINES[key].exec(text);
		if (!m) continue;
		out[key] = { pct: Number(m[1]), resetsAt: m[2] ? parseResetText(m[2], now) : null, capturedAt };
	}
	return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const RESET =
	/^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\s+at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:\(([^)]+)\))?$/i;

/**
 * "Oct 1 at 1:30pm (America/Indianapolis)" -> epoch seconds. Also takes a bare
 * time ("7am") meaning the next one. With no year, picks the nearest one that
 * isn't in the past (so "Jan 2" read on Dec 31 is next year). Null if unreadable.
 */
export function parseResetText(text: string, now: Date): number | null {
	const m = RESET.exec(text.trim());
	if (!m) return null;
	const [, mon, day, year, hourText, minText, ampm, zoneText] = m;
	let hour = Number(hourText) % 12;
	if (ampm.toLowerCase() === "pm") hour += 12;
	const minute = minText ? Number(minText) : 0;
	const zone = zoneText && isValidZone(zoneText) ? zoneText : undefined;
	const today = wallDate(now, zone);
	const nowSec = now.getTime() / 1000;

	if (mon) {
		const month = MONTHS.indexOf(mon.toLowerCase());
		if (month < 0) return null;
		const d = Number(day);
		if (year) return toEpoch(Number(year), month, d, hour, minute, zone);
		const guess = toEpoch(today.year, month, d, hour, minute, zone);
		// A reset is never more than a week out, so anything well in the past means next year.
		return guess < nowSec - 2 * 86400 ? toEpoch(today.year + 1, month, d, hour, minute, zone) : guess;
	}
	const guess = toEpoch(today.year, today.month, today.day, hour, minute, zone);
	return guess <= nowSec ? toEpoch(today.year, today.month, today.day + 1, hour, minute, zone) : guess;
}

function isValidZone(zone: string): boolean {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** Calendar fields of `date` as seen in `zone` (local time when undefined). */
function wallDate(date: Date, zone: string | undefined) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: zone,
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
		hourCycle: "h23",
	}).formatToParts(date);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	return { year: get("year"), month: get("month") - 1, day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Epoch seconds for a wall-clock time in `zone`. Date.UTC normalizes day overflow (e.g. day 32). */
function toEpoch(year: number, month: number, day: number, hour: number, minute: number, zone: string | undefined): number {
	const asUtc = Date.UTC(year, month, day, hour, minute);
	const offsetAt = (ms: number) => {
		const w = wallDate(new Date(ms), zone);
		return Date.UTC(w.year, w.month, w.day, w.hour, w.minute, w.second) - ms;
	};
	let ms = asUtc - offsetAt(asUtc);
	ms = asUtc - offsetAt(ms); // second pass settles DST edges
	return Math.floor(ms / 1000);
}
