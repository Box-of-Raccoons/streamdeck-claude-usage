import { execFile } from "node:child_process";

export const DEFAULT_APP = "Claude";

/** Arguments for `open`: an app name ("Claude") or a path to a .app bundle both go through -a. */
export function openArgs(app: string | undefined): string[] {
	const name = app?.trim() || DEFAULT_APP;
	return ["-a", name];
}

/** Opens (or brings forward) the app. Resolves false when macOS can't find it. */
export function openApp(app: string | undefined): Promise<boolean> {
	return new Promise((resolve) => {
		execFile("/usr/bin/open", openArgs(app), (err) => resolve(!err));
	});
}
