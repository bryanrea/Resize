# Resize

A small, fast Chrome extension for resizing your browser window to common device dimensions. Built because most resize extensions are bloated, ugly, or lie about the size they give you.

## Features

- **Viewport-accurate** — sizes match what the page actually sees, not the outer window.
- **Curated, current presets** — Mobile, Tablet, Laptop, Desktop, refreshed for current devices.
- **Custom W×H** — type any size at the bottom.
- **Search by name or dimension** — type `ipad`, `1920`, or `1920x1080`.
- **Keyboard navigation** — ↑↓ to move, Enter to apply, Esc to clear search.
- **Smooth eased animation** — `requestAnimationFrame` + ease-out cubic, no jitter.
- **Undo / Redo via keyboard** — per-window history stack (up to 20), bound by you in `chrome://extensions/shortcuts`.
- **Active size highlighted** — the popup shows which preset (if any) the current window matches.
- **Handles maximized windows** — automatically un-maximizes before resizing.
- **Off-screen safety** — clamps targets to the available screen.
- **Dark mode** — follows the system theme.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.

## Usage

Click the toolbar icon to open the popup, then:

- Click a preset to resize.
- Use the **Custom** row at the bottom for arbitrary sizes.

### Viewport-accurate sizing

The extension measures the difference between your current outer window and `window.innerWidth`/`innerHeight` when the popup opens, then adds it back to every target. So a "393 × 852" iPhone 16 preset gives you an actual 393 × 852 *viewport*. On `chrome://` and similar restricted tabs where the page can't be measured, it falls back to outer-window targeting silently.

### Keyboard shortcuts

The extension exposes two commands you can bind in `chrome://extensions/shortcuts`:

- **Undo last resize**
- **Redo last resize**

They're intentionally **unbound by default** so they don't override the page's own Ctrl/Cmd+Z. Assign whatever you like.

Inside the popup:

- `↑` / `↓` — move selection
- `Enter` — apply selected preset
- `Esc` — clear search / custom inputs
- Type anything — filter (auto-focuses the search box)

## Permissions

- `activeTab` + `scripting` — to measure the page's `innerWidth`/`innerHeight` once when the popup opens (for viewport mode). The extension never reads page content.
- `windows` — to read and update the current window's size.
- `storage` — to keep the per-window undo history.

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
