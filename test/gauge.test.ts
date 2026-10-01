import { describe, expect, it } from "vitest";

import { arcPath, COLORS, levelFor, renderCombo, renderGauge, toDataUrl } from "../src/gauge.js";

const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)"[^>]*stroke="([^"]+)"/g)].map((m) => ({ d: m[1], stroke: m[2] }));
const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

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

describe("renderCombo", () => {
	const OUTER = 60;
	const INNER = 45;

	it("puts 5h on the outer ring and 7d on the inner, each in its own band color", () => {
		const [outerTrack, outerFill, innerTrack, innerFill] = paths(renderCombo(93, 58));
		expect(outerTrack.d).toBe(arcPath(1, OUTER));
		expect(outerFill).toEqual({ d: arcPath(0.93, OUTER), stroke: COLORS.red });
		expect(innerTrack.d).toBe(arcPath(1, INNER));
		expect(innerFill).toEqual({ d: arcPath(0.58, INNER), stroke: COLORS.green });
	});

	it("shows the 5h number big, the 7d number under it, and the ring legend", () => {
		const svg = renderCombo(45.4, 12.6);
		expect(texts(svg)).toEqual(["45%", "13%", "5h · 7d"]);
		expect(svg).toMatch(/font-weight="bold" font-size="28" fill="#FFFFFF">45%</);
	});

	it("colors each ring by its own rounded value", () => {
		const [, outerFill, , innerFill] = paths(renderCombo(59.5, 89.5));
		expect(outerFill.stroke).toBe(COLORS.orange);
		expect(innerFill.stroke).toBe(COLORS.red);
	});

	it("handles each window's missing data on its own", () => {
		const onlyFive = renderCombo(30, null);
		expect(texts(onlyFive)).toEqual(["30%", "--", "5h · 7d"]);
		expect(paths(onlyFive).map((p) => p.d)).toEqual([arcPath(1, OUTER), arcPath(0.3, OUTER), arcPath(1, INNER)]);
		const onlySeven = renderCombo(null, 70);
		expect(texts(onlySeven)).toEqual(["--", "70%", "5h · 7d"]);
		expect(paths(onlySeven).map((p) => p.d)).toEqual([arcPath(1, OUTER), arcPath(1, INNER), arcPath(0.7, INNER)]);
	});

	it("shrinks the big number for 100% and up", () => {
		expect(renderCombo(100, 50)).toMatch(/font-size="24" fill="#FFFFFF">100%</);
	});
});

it("arcPath scales with the radius", () => {
	// r=60 around (72,72): 135° -> (29.57, 114.43); half sweep ends at 12 o'clock (72, 12)
	expect(arcPath(0.5, 60)).toBe("M 29.57 114.43 A 60 60 0 0 1 72 12");
});
