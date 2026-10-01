/**
 * One poller shared by every gauge key. Keys come and go as pages change, so
 * the numbers live here, not in the keys.
 */
import { parseUsageText, pickCurrent, WINDOWS, type Readings, type WindowKey } from "./usage.js";
import type { TapScan } from "./sources.js";

export type Snapshot = Record<WindowKey, number | null>;

/** A tap reading older than this no longer counts as live; fall back to /usage. */
export const TAP_FRESH_SECONDS = 600;
/** How often to run /usage while the tap is stale. */
export const POLL_GAP_SECONDS = 120;
/** Faster retry when a window has no current value at all (startup, just reset). */
export const POLL_GAP_EMPTY_SECONDS = 60;

export interface PollState {
	newestTapCapture: number | null;
	lastPollAt: number | null;
	pollInFlight: boolean;
	haveAll: boolean;
}

/** Whether to run `claude -p /usage` now. */
export function shouldPoll(s: PollState, nowSec: number): boolean {
	if (s.pollInFlight) return false;
	const tapFresh = s.newestTapCapture != null && nowSec - s.newestTapCapture < TAP_FRESH_SECONDS;
	if (tapFresh && s.haveAll) return false;
	if (s.lastPollAt == null) return true;
	const gap = s.haveAll ? POLL_GAP_SECONDS : POLL_GAP_EMPTY_SECONDS;
	return nowSec - s.lastPollAt >= gap;
}

export interface ServiceDeps {
	readTap: (nowSec: number) => Promise<TapScan>;
	/** Returns the /usage text; null when Claude Code isn't installed. */
	runUsage: () => Promise<string | null>;
	now: () => Date;
	log?: (msg: string) => void;
}

export class UsageService {
	private polled: Readings = {};
	private lastPollAt: number | null = null;
	private pollInFlight = false;
	private snapshot: Snapshot = { five_hour: null, seven_day: null };
	private listeners = new Set<(s: Snapshot) => void>();
	private timer: NodeJS.Timeout | null = null;

	constructor(private deps: ServiceDeps) {}

	get current(): Snapshot {
		return this.snapshot;
	}

	subscribe(fn: (s: Snapshot) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	start(intervalMs = 5_000): void {
		if (this.timer) return;
		void this.tick();
		this.timer = setInterval(() => void this.tick(), intervalMs);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/** One scan: read the tap, maybe start a /usage poll, publish the merged numbers. */
	async tick(): Promise<void> {
		const nowSec = this.deps.now().getTime() / 1000;
		const tap = await this.deps.readTap(nowSec);
		const next = this.merge(tap, nowSec);
		this.publish(next);
		const state: PollState = {
			newestTapCapture: tap.newestCapture,
			lastPollAt: this.lastPollAt,
			pollInFlight: this.pollInFlight,
			haveAll: WINDOWS.every((k) => next[k] != null),
		};
		if (shouldPoll(state, nowSec)) await this.poll(tap);
	}

	private async poll(tap: TapScan): Promise<void> {
		this.pollInFlight = true;
		const now = this.deps.now();
		this.lastPollAt = now.getTime() / 1000;
		try {
			const text = await this.deps.runUsage();
			if (text == null) {
				this.deps.log?.("claude not found; only the statusline tap can feed the gauges");
				return;
			}
			const parsed = parseUsageText(text, now);
			if (WINDOWS.every((k) => parsed[k] == null)) this.deps.log?.("could not read /usage output");
			this.polled = { ...this.polled, ...parsed };
			this.publish(this.merge(tap, this.deps.now().getTime() / 1000));
		} catch (e) {
			this.deps.log?.(`usage poll failed: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.pollInFlight = false;
		}
	}

	private merge(tap: TapScan, nowSec: number): Snapshot {
		const out = {} as Snapshot;
		for (const key of WINDOWS) {
			const polled = this.polled[key];
			const all = polled ? [...tap.readings[key], polled] : tap.readings[key];
			out[key] = pickCurrent(all, nowSec)?.pct ?? null;
		}
		return out;
	}

	private publish(next: Snapshot): void {
		if (WINDOWS.every((k) => next[k] === this.snapshot[k])) return;
		this.snapshot = next;
		for (const fn of this.listeners) fn(next);
	}
}
