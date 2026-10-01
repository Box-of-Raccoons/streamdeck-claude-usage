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

function point(deg: number, radius: number): string {
	const rad = (deg * Math.PI) / 180;
	const x = CX + radius * Math.cos(rad);
	const y = CY + radius * Math.sin(rad);
	return `${round(x)} ${round(y)}`;
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/** SVG path for the first `fraction` (0..1) of an arc of `radius`, or null when there is nothing to draw. */
export function arcPath(fraction: number, radius = RADIUS): string | null {
	const f = Math.max(0, Math.min(1, fraction));
	if (f === 0) return null;
	const sweep = SWEEP_DEG * f;
	const largeArc = sweep > 180 ? 1 : 0;
	return `M ${point(START_DEG, radius)} A ${radius} ${radius} 0 ${largeArc} 1 ${point(START_DEG + sweep, radius)}`;
}

function escapeXml(s: string): string {
	return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Rounded once, so the text and the color always agree (a key never reads "60%" in green). */
function shownValue(pct: number | null): number | null {
	return pct == null || !Number.isFinite(pct) ? null : Math.round(pct);
}

function percentText(shown: number | null): string {
	return shown == null ? "--" : `${shown}%`;
}

/** Grey track plus the used part in its band color. */
function ring(shown: number | null, radius: number, stroke: number): string {
	const track = `<path d="${arcPath(1, radius)}" fill="none" stroke="${TRACK}" stroke-width="${stroke}" stroke-linecap="round"/>`;
	const fill = shown == null ? null : arcPath(shown / 100, radius);
	if (shown == null || !fill) return track;
	return track + `<path d="${fill}" fill="none" stroke="${COLORS[levelFor(shown)]}" stroke-width="${stroke}" stroke-linecap="round"/>`;
}

function text(x: number, y: number, size: number, color: string, content: string, bold = false): string {
	return `<text x="${x}" y="${y}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"${bold ? ' font-weight="bold"' : ""} font-size="${size}" fill="${color}">${escapeXml(content)}</text>`;
}

function frame(body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>${body}</svg>`;
}

/** One window: `pct` null means "no data": grey track only, "--" in the center. */
export function renderGauge(pct: number | null, label: string): string {
	const shown = shownValue(pct);
	const value = percentText(shown);
	const fontSize = value.length > 3 ? 29 : 35;
	return frame(ring(shown, RADIUS, STROKE) + text(CX, CY + fontSize * 0.35, fontSize, VALUE, value, true) + text(CX, 132, 20, LABEL, label));
}

const COMBO_OUTER = { radius: 60, stroke: 10 };
const COMBO_INNER = { radius: 45, stroke: 8 };

/**
 * Both windows on one key: 5-hour on the outer ring with the big number,
 * 7-day on the inner ring with the small grey number under it.
 */
export function renderCombo(fiveHour: number | null, sevenDay: number | null): string {
	const five = shownValue(fiveHour);
	const seven = shownValue(sevenDay);
	const big = percentText(five);
	return frame(
		ring(five, COMBO_OUTER.radius, COMBO_OUTER.stroke) +
			ring(seven, COMBO_INNER.radius, COMBO_INNER.stroke) +
			text(CX, 74, big.length > 3 ? 24 : 28, VALUE, big, true) +
			text(CX, 96, 17, LABEL, percentText(seven)) +
			text(CX, 138, 16, LABEL, "5h · 7d"),
	);
}

/** Stream Deck's setImage takes a data URL. */
export function toDataUrl(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
