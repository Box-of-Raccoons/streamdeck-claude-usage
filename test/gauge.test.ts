import { describe, expect, it } from "vitest";

import { arcPath, COLORS, levelFor, renderGauge, toDataUrl } from "../src/gauge.js";

const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)"[^>]*stroke="([^"]+)"/g)].map((m) => ({ d: m[1], stroke: m[2] }));

describe("levelFor", () => {
	it.each([
		[0, "green"],
		[59, "green"],
		[60, "orange"],
		[89, "orange"],
		[90, "red"],
		[100, "red"],
		[130, "red"],
	])("%i%% is %s", (pct, level) => {
		expect(levelFor(pct)).toBe(level);
	});
});

describe("arcPath", () => {
	it("draws nothing at zero", () => {
		expect(arcPath(0)).toBeNull();
		expect(arcPath(-0.5)).toBeNull();
	});

	it("starts bottom-left and ends bottom-right when full", () => {
		// r=56 around (72,72): 135° -> (32.4, 111.6), 405° -> (111.6, 111.6)
		expect(arcPath(1)).toBe("M 32.4 111.6 A 56 56 0 1 1 111.6 111.6");
	});

	it("ends straight up at 50% and uses the short arc until past 180°", () => {
		// half of 270° is 135° of sweep: 135+135 = 270° = 12 o'clock
		expect(arcPath(0.5)).toBe("M 32.4 111.6 A 56 56 0 0 1 72 16");
		expect(arcPath(0.7)).toContain(" 0 1 1 ");
	});

	it("caps at a full arc", () => {
		expect(arcPath(1.5)).toBe(arcPath(1));
	});
});

describe("renderGauge", () => {
	it("shows the rounded percentage and the label", () => {
		const svg = renderGauge(55.4, "5h");
		expect(svg).toContain(">55%</text>");
		expect(svg).toContain(">5h</text>");
	});

	it("draws the track plus a fill in the band color", () => {
		const [track, fill] = paths(renderGauge(72, "7d"));
		expect(track.d).toBe(arcPath(1));
		expect(fill).toEqual({ d: arcPath(0.72), stroke: COLORS.orange });
	});

	it("colors by the rounded value, so the text and color always agree", () => {
		expect(paths(renderGauge(59.4, "5h"))[1].stroke).toBe(COLORS.green);
		const svg = renderGauge(59.5, "5h");
		expect(svg).toContain(">60%</text>");
		expect(paths(svg)[1].stroke).toBe(COLORS.orange);
		expect(paths(renderGauge(89.5, "5h"))[1].stroke).toBe(COLORS.red);
	});

	it("shows -- and only the track when there's no data", () => {
		for (const pct of [null, Number.NaN]) {
			const svg = renderGauge(pct, "5h");
			expect(svg).toContain(">--</text>");
			expect(paths(svg)).toHaveLength(1);
		}
	});

	it("shows 0% with no fill", () => {
		const svg = renderGauge(0, "5h");
		expect(svg).toContain(">0%</text>");
		expect(paths(svg)).toHaveLength(1);
	});

	it("keeps the real number past 100 but fills no further than full", () => {
		const svg = renderGauge(104, "5h");
		expect(svg).toContain(">104%</text>");
		expect(paths(svg)[1]).toEqual({ d: arcPath(1), stroke: COLORS.red });
	});

	it("has a black background", () => {
		expect(renderGauge(10, "5h")).toContain('<rect width="144" height="144" fill="#000000"/>');
	});
});

it("toDataUrl round-trips", () => {
	const url = toDataUrl("<svg/>");
	expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
	expect(Buffer.from(url.split(",")[1], "base64").toString()).toBe("<svg/>");
});
