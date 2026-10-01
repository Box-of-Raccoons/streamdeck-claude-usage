import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import { renderGauge, toDataUrl } from "../gauge.js";
import { openApp } from "../launch.js";
import type { Snapshot, UsageService } from "../service.js";
import type { WindowKey } from "../usage.js";

type GaugeSettings = {
	window?: WindowKey;
	app?: string;
};

const LABELS: Record<WindowKey, string> = { five_hour: "5h", seven_day: "7d" };

interface Visible {
	action: KeyAction<GaugeSettings>;
	settings: GaugeSettings;
	lastImage: string | null;
}

/** One key showing one usage window as a gauge. Pressing it opens the chosen app. */
@action({ UUID: "com.boxofraccoons.claude-usage.gauge" })
export class UsageGauge extends SingletonAction<GaugeSettings> {
	private visible = new Map<string, Visible>();

	constructor(private service: UsageService) {
		super();
		service.subscribe((s) => this.renderAll(s));
	}

	override async onWillAppear(ev: WillAppearEvent<GaugeSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.visible.set(ev.action.id, { action: ev.action, settings: ev.payload.settings, lastImage: null });
		this.service.start();
		await this.render(ev.action.id, this.service.current);
	}

	override onWillDisappear(ev: WillDisappearEvent<GaugeSettings>): void {
		this.visible.delete(ev.action.id);
		if (this.visible.size === 0) this.service.stop();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<GaugeSettings>): Promise<void> {
		const v = this.visible.get(ev.action.id);
		if (!v) return;
		v.settings = ev.payload.settings;
		await this.render(ev.action.id, this.service.current);
	}

	override async onKeyDown(ev: KeyDownEvent<GaugeSettings>): Promise<void> {
		const ok = await openApp(ev.payload.settings.app);
		if (!ok) {
			streamDeck.logger.warn(`could not open app "${ev.payload.settings.app ?? ""}"`);
			await ev.action.showAlert();
		}
	}

	private renderAll(s: Snapshot): void {
		for (const id of this.visible.keys()) void this.render(id, s);
	}

	private async render(id: string, s: Snapshot): Promise<void> {
		const v = this.visible.get(id);
		if (!v) return;
		const window = v.settings.window ?? "five_hour";
		const image = toDataUrl(renderGauge(s[window], LABELS[window]));
		if (image === v.lastImage) return;
		v.lastImage = image;
		await v.action.setImage(image);
	}
}
