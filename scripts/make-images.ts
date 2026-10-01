/**
 * Writes the plugin's static images from the same renderer the keys use.
 * Run: node scripts/make-images.ts [previewDir]
 * The marketplace icon must be PNG, so it is rasterized with macOS's qlmanage.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { renderGauge } from "../src/gauge.ts";

const root = path.join(import.meta.dirname, "..", "com.boxofraccoons.claude-usage.sdPlugin", "imgs");

/** White 270° arc on transparent, as Elgato asks for action and category icons. */
function glyph(size: number): string {
	const c = size / 2, r = size * 0.36, sw = size * 0.12;
	const p = (deg: number) => `${(c + r * Math.cos((deg * Math.PI) / 180)).toFixed(2)} ${(c + r * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
		`<path d="M ${p(135)} A ${r} ${r} 0 1 1 ${p(45)}" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="${sw}" stroke-linecap="round"/>` +
		`<path d="M ${p(135)} A ${r} ${r} 0 1 1 ${p(330)}" fill="none" stroke="#FFFFFF" stroke-width="${sw}" stroke-linecap="round"/></svg>`;
}

function rasterize(svg: string, px: number, out: string): void {
	const dir = mkdtempSync(path.join(tmpdir(), "gauge-"));
	const src = path.join(dir, "img.svg");
	writeFileSync(src, svg);
	execFileSync("qlmanage", ["-t", "-s", String(px), "-o", dir, src], { stdio: "ignore" });
	renameSync(`${src}.png`, out);
}

mkdirSync(path.join(root, "actions", "gauge"), { recursive: true });
mkdirSync(path.join(root, "plugin"), { recursive: true });
const key = renderGauge(null, "");
writeFileSync(path.join(root, "actions", "gauge", "key.svg"), key);
writeFileSync(path.join(root, "actions", "gauge", "icon.svg"), glyph(20));
writeFileSync(path.join(root, "plugin", "category-icon.svg"), glyph(28));
rasterize(renderGauge(72, "5h"), 256, path.join(root, "plugin", "marketplace.png"));
rasterize(renderGauge(72, "5h"), 512, path.join(root, "plugin", "marketplace@2x.png"));

const preview = process.argv[2];
if (preview) {
	mkdirSync(preview, { recursive: true });
	for (const [pct, label] of [[null, "5h"], [0, "5h"], [3, "5h"], [45, "5h"], [59.4, "7d"], [60, "7d"], [89, "5h"], [90, "5h"], [100, "7d"], [104, "7d"]] as const) {
		rasterize(renderGauge(pct, label), 144, path.join(preview, `gauge-${pct}.png`));
	}
	rasterize(glyph(20).replace(/#FFFFFF/g, "#FFFFFF"), 80, path.join(preview, "icon.png"));
}
