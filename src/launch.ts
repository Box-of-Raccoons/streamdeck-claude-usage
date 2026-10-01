import { execFile } from "node:child_process";

export const DEFAULT_APP = "Claude";

/**
 * The picker stores a plain path ("/Applications/Claude.app"), but older Stream Deck
 * builds hand back file URLs or percent-encoded paths, and a picked bundle can end in "/".
 * Accept all of those, plus a bare app name typed into settings by hand.
 */
export function normalizeApp(value: string | undefined): string {
	let app = value?.trim() ?? "";
	if (app.startsWith("file://")) {
		try {
			app = decodeURIComponent(new URL(app).pathname);
		} catch {
			// leave it as is; open will report the failure
		}
	} else if (/%[0-9A-Fa-f]{2}/.test(app)) {
		try {
			app = decodeURIComponent(app);
		} catch {
			// not really encoded
		}
	}
	if (app.length > 1) app = app.replace(/\/+$/, "");
	return app || DEFAULT_APP;
}

/** Arguments for `open`: an app name ("Claude") or a path to a .app bundle both go through -a. */
export function openArgs(app: string | undefined): string[] {
	return ["-a", normalizeApp(app)];
}

/** Opens (or brings forward) the app. Resolves false when macOS can't find it. */
export function openApp(app: string | undefined): Promise<boolean> {
	return new Promise((resolve) => {
		execFile("/usr/bin/open", openArgs(app), (err) => resolve(!err));
	});
}
