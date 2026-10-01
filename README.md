# Claude Usage Gauges for Stream Deck

Shows your Claude 5-hour and 7-day usage as gauge keys: a 3/4 circle on black,
green below 60%, orange from 60%, red from 90%, with the percentage in the
center. A "Both" key shows the 5-hour window on an outer ring and the 7-day window on an
inner ring. Pressing a key opens the app you pick for it (Claude, a terminal, anything).

Requires a Claude Pro or Max subscription, Claude Code installed and signed in,
Stream Deck 7.1 or later, and macOS 13 or later.

## Use it

1. Drag **Usage Gauge** (category "Claude Usage Gauges") onto a key.
2. In its settings pick **Window**: 5-hour, 7-day, or Both. Both puts 5h on the outer ring
   with the big number and 7d on the inner ring with the small grey number.
3. Under **App to open**, click **Choose App...** and pick the app the key should open.
   With none chosen, it opens Claude.

The keys show `--` until the first reading arrives (a few seconds).

## Where the numbers come from

**Out of the box**, the plugin runs `claude -p /usage` every 2 minutes and reads its text.
That command is local to Claude Code: no model call and zero tokens. It finds `claude` in
`~/.local/bin`, `~/.claude/local`, `/opt/homebrew/bin`, `/usr/local/bin` or `~/.npm-global/bin`.

**Optional, live updates:** if you have a custom statusline, add a tap to it. Claude Code
passes `rate_limits` to statusline commands after each response. Write it to
`~/.claude/deck/usage/<session_id>.json` and the gauges update within 5 seconds while you work,
and stop running `/usage` while any session's tap is under 10 minutes old.

For a Node-based statusline, after you parse the JSON into `data`:

```js
try {
  var rl = data.rate_limits;
  if (rl && (rl.five_hour || rl.seven_day)) {
    var fs = require("fs"), path = require("path"), os = require("os");
    var dir = path.join(os.homedir(), ".claude", "deck", "usage");
    fs.mkdirSync(dir, { recursive: true });
    var file = path.join(dir, String(data.session_id || "default").replace(/[^A-Za-z0-9_-]/g, "") + ".json");
    var tmp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ captured_at: Date.now() / 1000, five_hour: rl.five_hour || null, seven_day: rl.seven_day || null }));
    fs.renameSync(tmp, file);
  }
} catch (_) {}
```

Each session writes its own file. An idle session keeps reporting its last number, so the
plugin takes the highest reading for the current window (usage only rises until the window
resets) and ignores readings for a window that has already reset. Files untouched for
8 days are deleted.

## Develop

```sh
pnpm install
pnpm check                 # typecheck + tests
pnpm build                 # bundle to com.boxofraccoons.claude-usage.sdPlugin/bin
streamdeck link com.boxofraccoons.claude-usage.sdPlugin
streamdeck restart com.boxofraccoons.claude-usage
node scripts/make-images.ts [previewDir]   # regenerate icons (and preview PNGs)
```

A newly linked plugin only appears after the Stream Deck app restarts. Plugin logs are in
`com.boxofraccoons.claude-usage.sdPlugin/logs/`.
