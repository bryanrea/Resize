# Resize

A small, fast Chrome extension for resizing your browser window to common device dimensions. Built because most resize extensions are bloated, ugly, or lie about the size they give you.

## Features

- **Viewport-accurate** — sizes match what the page actually sees, not the outer window, including at non-default page zoom.
- **Curated, current presets** — Mobile, Tablet, Laptop, Desktop, refreshed for current devices.
- **Custom W×H** — type any size in the first row.
- **Type-to-resize** — type a preset's number to apply it.
- **Keyboard navigation** — ↑↓ to move, Enter to apply.
- **Smooth eased animation** — time-based ease-out cubic, no jitter. Respects reduced motion.
- **Undo / Redo via keyboard** — per-window history stack (up to 20), bound by you in `chrome://extensions/shortcuts`.
- **Active size highlighted** — the popup shows which preset (if any) the current window matches.
- **Handles maximized and fullscreen windows** — leaves either state before resizing.
- **Clamps to the screen** — targets never exceed the available screen size.
- **Reports the real size** — if a size can't be reached, the toast shows the size you got.
- **Dark mode** — follows the system theme.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.

## Usage

Click the toolbar icon to open the popup, then:

- Click a preset to resize.
- Use the **Custom** row at the top for arbitrary sizes. Enter applies.

### Viewport-accurate sizing

The extension measures the difference between your current outer window and `window.innerWidth`/`innerHeight` when the popup opens and before each resize, then adds it back to every target. It accounts for page zoom, so a "402 × 874" iPhone 17 preset gives you an actual 402 × 874 *viewport*, the size the page's media queries see. On `chrome://` and similar restricted tabs where the page can't be measured, it falls back to outer-window targeting silently.

Chrome enforces a minimum window width of about 500px, so presets narrower than that can't be reached in a normal browser window. The toast shows the size you actually got, and no preset is highlighted.

### Keyboard shortcuts

The extension exposes two commands you can bind in `chrome://extensions/shortcuts`:

- **Undo last resize**
- **Redo last resize**

They're intentionally **unbound by default** so they don't override the page's own Ctrl/Cmd+Z. Assign whatever you like.

Inside the popup:

- `↑` / `↓` — move selection
- `Enter` — apply selected preset, or commit a number you're typing
- `1`–`9`, `0` — type a preset's number to apply it
- `Esc` — cancel a number you're typing, or leave the custom inputs

## Permissions

- `activeTab` + `scripting` — to measure the page's `innerWidth`/`innerHeight` when the popup opens and before each resize. The extension never reads page content.
- `storage` — to keep the per-window undo history and your last custom size for the browser session.

## Project structure

```
resize/
├── manifest.json
├── popup.html
├── popup.js
├── background.js   ← MV3 service worker (undo/redo + commands)
└── icons/
```

## License

MIT — see `LICENSE`.
