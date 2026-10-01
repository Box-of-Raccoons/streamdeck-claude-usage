import streamDeck from "@elgato/streamdeck";

import { UsageGauge } from "./actions/usage-gauge.js";
import { UsageService } from "./service.js";
import { DEFAULT_TAP_DIR, findClaude, readTapDir, runUsageCommand } from "./sources.js";

streamDeck.logger.setLevel("info");

const service = new UsageService({
	readTap: (nowSec) => readTapDir(DEFAULT_TAP_DIR, nowSec),
	runUsage: async () => {
		const claude = findClaude();
		return claude ? runUsageCommand(claude) : null;
	},
	now: () => new Date(),
	log: (msg) => streamDeck.logger.info(msg),
});

streamDeck.actions.registerAction(new UsageGauge(service));
streamDeck.connect();
