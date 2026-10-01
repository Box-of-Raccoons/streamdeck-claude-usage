/**
 * Where readings come from: the statusline tap folder and `claude -p /usage`.
 */
import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { parseTapFile, WINDOWS, type Reading, type WindowKey } from "./usage.js";

export const DEFAULT_TAP_DIR = path.join(homedir(), ".claude", "deck", "usage");

/** Tap files untouched this long belong to sessions long gone; the 7-day window outlives anything younger. */
const PRUNE_AFTER_SECONDS = 8 * 86400;

export interface TapScan {
	readings: Record<WindowKey, Reading[]>;
	/** Newest captured_at across all tap files, epoch seconds; null when there are none. */
	newestCapture: number | null;
}

/** Reads every session's tap file. A missing folder is not an error: the tap is optional. */
export async function readTapDir(dir: string, nowSec: number): Promise<TapScan> {
	const scan: TapScan = { readings: { five_hour: [], seven_day: [] }, newestCapture: null };
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return scan;
	}
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		const file = path.join(dir, name);
		try {
			const info = await stat(file);
			if (nowSec - info.mtimeMs / 1000 > PRUNE_AFTER_SECONDS) {
				await unlink(file);
				continue;
			}
			const parsed = parseTapFile(JSON.parse(await readFile(file, "utf8")));
			if (!parsed) continue;
			for (const key of WINDOWS) {
				const r = parsed[key];
				if (!r) continue;
				scan.readings[key].push(r);
				scan.newestCapture = Math.max(scan.newestCapture ?? 0, r.capturedAt);
			}
		} catch {
			// Half-written or vanished between readdir and read; the next scan picks it up.
		}
	}
	return scan;
}

/**
 * Stream Deck starts plugins from a GUI app, so PATH is short and has no
 * Homebrew or ~/.local/bin. Look in the places installers put `claude`.
 */
export function findClaude(home = homedir()): string | null {
	const candidates = [
		path.join(home, ".local", "bin", "claude"),
		path.join(home, ".claude", "local", "claude"),
		"/opt/homebrew/bin/claude",
		"/usr/local/bin/claude",
		path.join(home, ".npm-global", "bin", "claude"),
	];
	for (const c of candidates) {
		try {
			accessSync(c, constants.X_OK);
			return c;
		} catch {
			// try the next one
		}
	}
	return null;
}

/**
 * Runs `claude -p /usage` and returns its text. It's a local command: no model
 * call, zero tokens (checked on 2.1.286). Without --no-session-persistence every
 * poll would save a transcript.
 */
export function runUsageCommand(claude: string, timeoutMs = 30_000): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			claude,
			["-p", "/usage", "--output-format", "json", "--no-session-persistence"],
			{ cwd: homedir(), timeout: timeoutMs, maxBuffer: 1024 * 1024 },
			(err, stdout) => {
				if (err) return reject(err);
				try {
					const out = JSON.parse(stdout) as { result?: unknown; is_error?: boolean };
					if (out.is_error || typeof out.result !== "string") return reject(new Error("usage command failed"));
					resolve(out.result);
				} catch (e) {
					reject(e);
				}
			},
		);
	});
}
