# Resize — Design Guidelines

A small, opinionated visual language for a single-purpose Chrome extension. Inspired by Swiss design and the work at [outfit.hellohello.is](https://outfit.hellohello.is/).

The whole popup is 360px wide. Every decision below exists to keep that 360px feeling considered, calm, and fast.

---

## Principles

1. **One job, done well.** The popup resizes windows. Nothing else. Every pixel should serve that.
2. **Silence over noise.** No gradients. No shadows on UI chrome. No decorative icons. No emoji. No micro-copy. Hairlines, not borders.
3. **Black, white, grey, red.** That's the whole palette. Red is reserved for the brand mark, the active state, and one accent role per row (the index number).
4. **Latin grid.** Strict left edge (20px gutter), tabular numerics, asymmetric vertical rhythm. Text aligns to baselines; numbers align to columns.
5. **Helvetica or nothing close to it.** Display in `Helvetica Now Display`, body in `Helvetica Now Text`, both with kerning + stylistic alternates enabled.
6. **No defaults shouting.** Hover and selected states are reserved for explicit user intent. Nothing is highlighted just because the popup opened.
7. **Silent fallbacks.** If a resize can't fully apply (e.g. window larger than screen), let it clamp silently. Don't apologize.

---

## Color

CSS custom properties are the source of truth. Light and dark are mirror images; the accent and neutral roles never change name.

```css
:root {
  --bg:           #fafafa;   /* soft off-white, never pure #ffffff */
  --fg:           #0a0a0a;   /* soft off-black, never pure #000000 */

  --neutral-100:  #f0f0f0;   /* hover, group header tile */
  --neutral-300:  #d4d4d4;   /* hairline rules, muted dim text */
  --neutral-500:  #888888;   /* muted body text */
  --neutral-700:  #404040;   /* strong rule (reserved, rarely used) */

  --muted:        var(--neutral-500);
  --rule:         var(--neutral-300);
  --rule-strong:  var(--neutral-700);

  --accent:       #e30613;   /* Swiss red — index numbers, selection, brand */
  --hover:        var(--neutral-100);
  --selected:     #fdf0f0;   /* tinted red wash for keyboard-selected row */
}
```

Dark mode flips bg/fg and steps the neutral scale; the accent shifts to `#ff3b30` (iOS-style red, which reads better on dark).

**Rules of use**

- `--fg` is for primary content (device names, wordmark).
- `--muted` is for secondary content (dimensions, stamp, group labels).
- `--neutral-300` is for the lightest dim — section separators, input underlines, the `×` between dimensions.
- `--accent` only appears in: the brand mark (popup + extension icon), the index number on each preset row, the selection state, the search caret, the status bar, and the toast error/glyph.
- Never tint a hover state in red. Hover is `--hover` (neutral grey). Red is for *intent*, not proximity.

---

## Typography

```css
--font:         "Helvetica Now Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
--font-display: "Helvetica Now Display", "Helvetica Now Text", "Helvetica Neue", Helvetica, Arial, sans-serif;

font-feature-settings: "tnum" 1, "kern" 1, "ss01" 1;
-webkit-font-smoothing: antialiased;
```

**Type scale**

| Role               | Family   | Size | Weight | Letter spacing |
|--------------------|----------|------|--------|----------------|
| Wordmark           | display  | 28px | 700    | -0.035em       |
| Body / preset name | text     | 13px | 500    | -0.005em       |
| Dimensions         | text     | 12px | 400    | 0.01em (tabular) |
| Preset index       | text     | 10px | 700    | 0.05em         |
| Group header       | text     | 10px | 700    | 0.14em UPPERCASE |
| Stamp / toast      | text     | 10–11px | 500–700 | 0.10–0.12em UPPERCASE |

**Numeric columns**

Anywhere a number lives next to another number, use `font-variant-numeric: tabular-nums`. Dimensions, the version stamp, and the index column all depend on it.

---

## Layout

**Canvas**

- Popup body width: **360px** fixed (Chrome popup constraint, intentional).
- Horizontal gutter: **20px** on both sides.
- Vertical rhythm: 8px base unit. Headers can break this for visual weight (24px / 18px asymmetry).

**Grid for a preset row** (the primary unit of UI)

```css
.preset {
  display: grid;
  grid-template-columns: 22px 1fr auto;  /* index │ name │ dimensions */
  gap: 14px;
  padding: 8px 20px;
}
```

- **22px column** — the index number, right-aligned visually by `text-align: left` plus tabular nums (so "01" and "15" share the same right edge).
- **1fr column** — the device name. Truncates with ellipsis if it would overflow.
- **auto column** — the dimensions block. Right-flush against the row's right edge.

**Dimensions block**

Plain inline text. No internal grid. Right-aligned by the parent grid's `auto` column. `font-variant-numeric: tabular-nums` keeps digit widths consistent. The `×` separator sits with `margin: 0 6px` and renders one step lighter (`--neutral-300`) than the surrounding numbers.

**Asymmetric padding**

The header uses `padding: 24px 20px 18px` — slightly heavier on top than bottom. This is intentional Swiss-style asymmetry; it gives the wordmark room to breathe at the top of the popup without making the whole header feel chunky.

---

## Hairlines

There are no `border`s in this UI. Everything that separates is a 1px hairline of `var(--rule)` (`#d4d4d4` light / `#2a2a2a` dark), implemented with `border-bottom` between sibling sections.

A top-edge hairline on the `<body>` element (`box-shadow: inset 0 1px 0 var(--rule)`) closes the seam between the popup's invisible top border and the first content.

The sticky group headers also paint a hairline as `inset 0 -1px 0 var(--rule)` — but only via the `.stuck` class, which is toggled by an `IntersectionObserver`. The hairline materializes the moment a header pins.

---

## Components

### Wordmark + brand mark

```html
<h1 class="wordmark">
  <svg class="brand-mark" viewBox="0 0 128 128" aria-hidden="true">
    <rect x="2" y="45" width="110" height="81" fill="#e30613" stroke="currentColor" stroke-width="4"/>
    <path d="M124 2V78H72V2H124Z" fill="#e30613" stroke="currentColor" stroke-width="4"/>
  </svg>
  Resize
</h1>
```

- 28px Helvetica Now Display, weight 700, kerning tightened to -0.035em.
- The brand mark is the same two-rectangle composition as the extension icon, rendered as inline SVG at **24×24px** with `margin-right: 12px`. Same red (`#e30613`), same proportions, same geometry. The shapes are tuned to occupy most of the canvas, so the mark holds presence at both 24px (wordmark) and 16px (toolbar).
- The 4px stroke uses `currentColor`, and the `.brand-mark` element's `color` is set to `var(--bg)`. This makes the separator between the two rectangles automatically pick up the popup background — white in light mode, near-black in dark mode — so the mark reads cleanly on either theme without shipping two variants.
- Static. The mark is the *brand*, not a status indicator. Match status is communicated solely by the red left-bar on the matched preset row.
- No `®`, no tagline, no version subtitle. The stamp `.1 / 1` floats on the right baseline as a quiet system tag.

### Group headers (sticky, frosted)

```css
.group-header {
  position: sticky;
  top: 0;
  padding: 6px 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  background: color-mix(in srgb, var(--neutral-100) 78%, transparent);
  backdrop-filter: saturate(180%) blur(12px);
  box-shadow: inset 0 -1px 0 transparent;
  transition: box-shadow 0.18s ease;
}
.group-header.stuck {
  box-shadow: inset 0 -1px 0 var(--rule);
}
```

- 78% opaque grey tile + `backdrop-filter` blur so preset rows visibly smear behind the label as they scroll under it.
- Symmetric vertical padding so the label is visually centered.
- Hairline appears only when actively pinned (sentinel-based IntersectionObserver toggles the `stuck` class).

### Preset row

| State        | Background     | Name color | Dim color   | Index color |
|--------------|----------------|------------|-------------|-------------|
| Default      | transparent    | `--fg`     | `--muted`   | `--accent`  |
| Hover        | `--hover`      | `--fg`     | `--fg`      | `--accent`  |
| Selected*    | `--selected`   | `--accent` | `--accent`  | `--accent`  |
| Current**    | transparent    | `--fg`     | `--muted`   | `--accent`  |

\* Selected = keyboard-navigated *or* matched by the type-to-resize buffer.  
\*\* Current = the preset whose dimensions match the active window; gets a 3px red bar on the left edge (`::before`).

Press feedback: `transform: translateY(0.5px)` on `:active` — barely perceptible, enough to feel.

### Custom row (inline editor)

Lives inside the preset list as the first row, with the same grid as everything else. Two `<input>`s sit in the dimensions slot styled as underline-only fields:

```css
.dim-input {
  width: 44px;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  font-variant-numeric: tabular-nums;
  caret-color: var(--accent);
}
.dim-input:focus { border-bottom-color: var(--accent); }
.dim-input::placeholder { color: var(--neutral-300); }
```

- No "SET" button. Enter applies.
- Inputs are pre-filled with the last custom value from `chrome.storage.session`.
- The Custom row has no index number — stock presets always stay numbered `01–15`.

### Toast

```css
.toast {
  position: fixed;
  left: 20px; right: 20px; bottom: 16px;
  padding: 10px 16px;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--bg);
  background: color-mix(in srgb, var(--fg) 82%, transparent);
  backdrop-filter: blur(14px) saturate(140%);
}
```

- Single re-usable element. Re-content + reset timer rather than stacking.
- Inverted color (dark in light mode, light in dark mode) with the same glassy blur as the headers.
- Errors swap the background to `color-mix(--accent 88%, transparent)` and stay visible 1000ms longer.
- Default visible duration: 1400ms. Errors: 2400ms.

### Status bar

A 2px red line glued to `bottom: 0` of the popup. Animates from `scaleX(0)` to `scaleX(1)` with `cubic-bezier(0.16, 1, 0.3, 1)` over 280ms when a resize fires, then fades to `opacity: 0`. It mirrors the resize action with no labels — pure motion feedback.

### Extension icon

Two red rectangles on a white tile — a smaller portrait rectangle in the upper-right overlapping a larger landscape rectangle in the lower-left. A 2px white stroke separates them where they meet, creating an L-shaped void. The composition reads as *two windows of different sizes* — the action of the product, not the brand.

```xml
<svg viewBox="0 0 128 128">
  <rect x="2" y="45" width="110" height="81" fill="#E30613" stroke="white" stroke-width="4"/>
  <path d="M124 2V78H72V2H124Z" fill="#E30613" stroke="white" stroke-width="4"/>
</svg>
```

**One mark, two contexts.** The toolbar icon and the popup wordmark share the same two-rectangle composition. The only difference is the surround: the toolbar version ships as a white tile (so it adapts to any Chrome theme), while the in-popup version is inline SVG with the separator stroke coming from `currentColor` = the popup's own background. Same geometry, same red, different framing.

**At 16px.** The geometry is supersampled and downscaled with Lanczos so the white separator survives. PNGs ship at 16 / 32 / 48 / 128. The white background is intentional — a *tile*, not a mark — which keeps the icon legible on both light and dark Chrome toolbars without needing two themed variants.

---

## Motion

Used sparingly. Three categories only:

| Purpose             | Duration | Easing                        |
|---------------------|----------|-------------------------------|
| State transitions (hover, color) | 80–250ms | `linear` or default `ease`   |
| Resize animation    | 280ms    | `easeOutCubic` (custom)       |
| Status bar fill     | 280ms    | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Toast appear        | 150ms    | `ease`                        |
| Sticky hairline     | 180ms    | `ease`                        |

`@media (prefers-reduced-motion: reduce)` kills all transitions and animations globally.

---

## Interaction patterns

**Selection only on explicit intent.** The popup opens with no row highlighted. The first highlight appears only when you press `↑`/`↓` or start typing a number.

**Type-to-resize.** Each preset row carries a 2-digit index in red. Typing a digit:

- Single digit that can't grow further → applies immediately.
- Digit that could be the prefix of a 2-digit number → waits 700ms for a second digit, with the candidate row pre-highlighted in red.
- `Enter` mid-buffer commits early. `Escape` cancels. Arrow keys clear the buffer.

**Keyboard hierarchy**

| Key            | Action                                       |
|----------------|----------------------------------------------|
| `↑` / `↓`      | Move selection                               |
| `Enter`        | Apply selected, or commit type buffer        |
| `1`–`9`, `0`   | Build type buffer                            |
| `Escape`       | Clear type buffer / blur input               |
| Click on Custom row (outside input) | Focus the width input    |

---

## Iconography

There is none. The only graphic in the UI is the brand mark (two red rectangles) — same in the wordmark and the toolbar icon. If a meaning needs an icon, write it in 10px UPPERCASE with 0.14em tracking instead.

---

## Voice

- Labels are nouns. **MOBILE**, **CUSTOM**, **SET** (when it existed) — never sentences.
- Toasts read like `device name · W × H`. The middle dot is a `·` (U+00B7), not a hyphen.
- No micro-copy. No "Choose a preset". No "Done!". The product *is* the action.

---

## Don'ts

- ✗ Don't use `border-radius` on rectangular UI. Chrome popups can't render rounded outer corners cross-platform; everything inside stays square as a feature.
- ✗ Don't use `box-shadow` to imply elevation. The only shadow in the UI is the inset hairline trick.
- ✗ Don't introduce a second accent color. If you need a second signal, change weight or case, not hue.
- ✗ Don't reach for icons. We have ten typography rules to express hierarchy first.
- ✗ Don't add a "loading" spinner. The status bar and the resize animation are the only progress indicators.
- ✗ Don't pad inconsistently. 20px horizontal gutter is sacred; vertical rhythm flexes around it.
