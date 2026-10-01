# Usage gauge keys

## Why

First plugin that runs on the Stream Deck+ itself. Two keys show Claude's 5-hour and
7-day usage as gauges, so the remaining room is visible without opening a terminal.
Pressing a key opens an app chosen per key.

Changes from the earlier Deckhand plan (Obsidian, "Stream Deck Plus Control Deck"):

- One gauge per window instead of one key with two bars; bands are green below 60,
  orange from 60, red from 90 (the plan said 70/90).
- 2026-10-01: a separate plugin and repo, not part of Deckhand. Hardy wants to test ideas
  on their own before combining them, and expects some to be useful on their own in the
  Marketplace. That makes the `/usage` poll the zero-setup default and the statusline tap
  an optional speed-up, and it gets its own UUID (`com.boxofraccoons.claude-usage`).

## Decisions

- **Sources:** statusline tap (one file per session in `~/.claude/deck/usage/`) plus
  `claude -p /usage --output-format json --no-session-persistence` when no tap file is
  under 10 minutes old. Zero tokens, about 2 s (checked on 2.1.286). No user hooks fire
  during the poll (checked with `--debug-file`).
- **Merge:** highest reading among those in the current window (reset times within
  10 minutes count as the same window); readings past their reset are dropped. Idle
  sessions keep re-reporting old numbers, and usage only rises inside a window.
- **Display:** the rounded value drives both the text and the color, so "60%" is never green.
  No data shows a grey track and `--`.
- **Click:** `open -a <app>`, per-key setting, empty means Claude. Alert on failure.
- **Platform:** macOS only for now (`open -a`, `qlmanage` for the icon PNGs).

## Status (2026-10-01)

Built, 48 tests, all 16 mutations caught (with a no-op control that survives).
Linked into the Stream Deck app on the Mac mini; the plugin process starts.

Open:
- Look at the keys on the real device (rendering of SVG text in the Stream Deck app).
- Marketplace naming: "Claude" in a product name may need Anthropic's trademark rules checked.
- Windows support, if it goes to the Marketplace.
