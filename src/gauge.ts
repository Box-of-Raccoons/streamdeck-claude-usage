/**
 * Draws a usage gauge key as an SVG string: a 270° arc with the gap at the
 * bottom, filled in a threshold color, with the percentage in the center and
 * a small window label ("5h", "7d") in the gap. No image library needed;
 * Stream Deck renders the SVG itself.
 */

export type Level = "green" | "orange" | "red";

export const COLORS: Record<Level, string> = {
	green: "#30D158",
	orange: "#FF9F0A",
	red: "#FF453A",
};

const BACKGROUND = "#000000";
const TRACK = "#333333";
const LABEL = "#8E8E93";
const VALUE = "#FFFFFF";

const SIZE = 144;
const CX = 72;
const CY = 72;
const RADIUS = 56;
const STROKE = 12;
const START_DEG = 135; // bottom-left, measured clockwise from 3 o'clock
const SWEEP_DEG = 270;

/** Color band for a whole-number percentage: green below 60, orange to 89, red from 90. */
export function levelFor(pct: number): Level {
	if (pct >= 90) return "red";
	if (pct >= 60) return "orange";
	return "green";
}

function point(deg: number): string {
	const rad = (deg * Math.PI) / 180;
	const x = CX + RADIUS * Math.cos(rad);
	const y = CY + RADIUS * Math.sin(rad);
	return `${round(x)} ${round(y)}`;
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/** SVG path for the first `fraction` (0..1) of the arc, or null when there is nothing to draw. */
export function arcPath(fraction: number): string | null {
	const f = Math.max(0, Math.min(1, fraction));
	if (f === 0) return null;
	const sweep = SWEEP_DEG * f;
	const largeArc = sweep > 180 ? 1 : 0;
	return `M ${point(START_DEG)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${point(START_DEG + sweep)}`;
}

function escapeXml(s: string): string {
	return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The full key image. `pct` null means "no data": grey track only, "--" in the center.
 * The percentage is rounded once, and both the text and the color use the rounded value,
 * so a key never reads "60%" in green.
 */
export function renderGauge(pct: number | null, label: string): string {
	const shown = pct == null || !Number.isFinite(pct) ? null : Math.round(pct);
	const fill = shown == null ? null : arcPath(shown / 100);
	const color = shown == null ? null : COLORS[levelFor(shown)];
	const text = shown == null ? "--" : `${shown}%`;
	const fontSize = text.length > 3 ? 29 : 35;
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`,
		`<rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>`,
		`<path d="${arcPath(1)}" fill="none" stroke="${TRACK}" stroke-width="${STROKE}" stroke-linecap="round"/>`,
		fill && color
			? `<path d="${fill}" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round"/>`
			: "",
		`<text x="${CX}" y="${CY + fontSize * 0.35}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="bold" font-size="${fontSize}" fill="${VALUE}">${escapeXml(text)}</text>`,
		`<text x="${CX}" y="132" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="20" fill="${LABEL}">${escapeXml(label)}</text>`,
		`</svg>`,
	];
	return parts.join("");
}

/** Stream Deck's setImage takes a data URL. */
export function toDataUrl(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
