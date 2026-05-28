"use strict";

const PRESETS = [
  { group: "Mobile", name: "Galaxy S25", w: 360, h: 780 },
  { group: "Mobile", name: "iPhone 17", w: 402, h: 874 },
  { group: "Mobile", name: "Pixel 10", w: 412, h: 923 },
  { group: "Mobile", name: "iPhone 17 Pro Max", w: 440, h: 956 },

  { group: "Tablet", name: "iPad Mini", w: 744, h: 1133 },
  { group: "Tablet", name: "iPad Air", w: 820, h: 1180 },
  { group: "Tablet", name: "iPad Pro 11", w: 834, h: 1210 },
  { group: "Tablet", name: "iPad Pro 13", w: 1032, h: 1376 },

  { group: "Laptop", name: "MacBook Air 13", w: 1470, h: 956 },
  { group: "Laptop", name: "MacBook Pro 14", w: 1512, h: 982 },
  { group: "Laptop", name: "MacBook Pro 16", w: 1728, h: 1117 },

  { group: "Desktop", name: "HD", w: 1366, h: 768 },
  { group: "Desktop", name: "Full HD", w: 1920, h: 1080 },
  { group: "Desktop", name: "2K", w: 2560, h: 1440 },
  { group: "Desktop", name: "4K", w: 3840, h: 2160 },
];

const MATCH_TOLERANCE = 4;
const MIN_DIM = 200;
const MAX_DIM = 9999;
const TYPE_WAIT_MS = 700;

const $ = (sel) => document.querySelector(sel);

const els = {
  presets: $("#presets"),
  toast: $("#toast"),
  customW: null,
  customH: null,
  statusBar: $("#status-bar"),
};

const state = {
  windowId: null,
  current: { width: 0, height: 0 },
  chromeOffsets: { dx: 0, dy: 0 },
  selectedIndex: 0,
  visibleList: [],
  busy: false,
  recentCustom: null,
  showSelection: false,
  typeBuffer: "",
};

let typeTimer = null;

const RECENT_KEY = "recent_custom";

async function loadRecentCustom() {
  try {
    const data = await chrome.storage.session.get([RECENT_KEY]);
    const value = data[RECENT_KEY];
    state.recentCustom =
      value && Number.isFinite(value.w) && Number.isFinite(value.h)
        ? value
        : null;
  } catch (e) {
    state.recentCustom = null;
  }
}

function saveRecentCustom() {
  return chrome.storage.session
    .set({ [RECENT_KEY]: state.recentCustom })
    .catch(() => {});
}

// -------- Window measurement -------------------------------------------------

async function refreshWindow() {
  const win = await chrome.windows.getCurrent();
  state.windowId = win.id;
  state.current = { width: win.width, height: win.height };
}

async function measureViewportOffsets() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.id) return;
    if (!/^https?:|^file:/.test(tab.url || "")) return;
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        iw: window.innerWidth,
        ih: window.innerHeight,
      }),
    });
    if (result) {
      state.chromeOffsets = {
        dx: Math.max(0, state.current.width - result.iw),
        dy: Math.max(0, state.current.height - result.ih),
      };
    }
  } catch (e) {
    // Tab is restricted (chrome://, etc.) — fall back to outer-window targeting.
  }
}

// -------- Math ---------------------------------------------------------------

function targetWindowSize(p) {
  return clampToScreen({
    width: p.w + state.chromeOffsets.dx,
    height: p.h + state.chromeOffsets.dy,
  });
}

function clampToScreen({ width, height }) {
  return {
    width: Math.max(MIN_DIM, Math.min(width, screen.availWidth)),
    height: Math.max(MIN_DIM, Math.min(height, screen.availHeight)),
  };
}

function findMatchedPreset() {
  for (const p of PRESETS) {
    const t = targetWindowSize(p);
    if (
      Math.abs(t.width - state.current.width) <= MATCH_TOLERANCE &&
      Math.abs(t.height - state.current.height) <= MATCH_TOLERANCE
    ) {
      return p;
    }
  }
  return null;
}

function isCustomCurrent() {
  if (!state.recentCustom) return false;
  const t = clampToScreen({
    width: state.recentCustom.w + state.chromeOffsets.dx,
    height: state.recentCustom.h + state.chromeOffsets.dy,
  });
  return (
    Math.abs(t.width - state.current.width) <= MATCH_TOLERANCE &&
    Math.abs(t.height - state.current.height) <= MATCH_TOLERANCE
  );
}

// -------- Resize -------------------------------------------------------------

async function prepareForResize() {
  await refreshWindow();
  await measureViewportOffsets();
}

async function applyResize(resolveTarget, label) {
  if (state.busy) return;
  state.busy = true;
  pulseStatusBar();
  try {
    await prepareForResize();
    const target = resolveTarget();

    let win = await chrome.windows.get(state.windowId);
    const snapshot = {
      width: win.width,
      height: win.height,
      left: win.left,
      top: win.top,
      state: win.state,
    };

    const result = await chrome.runtime.sendMessage({
      type: "resize_window",
      windowId: state.windowId,
      target,
      snapshot,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    });

    await refreshWindow();
    if (result?.ok) {
      state.current = {
        width: result.width ?? target.width,
        height: result.height ?? target.height,
      };
      showToast(label);
      renderPresets();
    } else {
      showToast("Resize failed", { error: true });
    }
  } catch (error) {
    console.error("Resize failed:", error);
    showToast("Resize failed", { error: true });
  } finally {
    state.busy = false;
  }
}

async function resizeToPreset(preset) {
  const label = `${preset.name} · ${preset.w} × ${preset.h}`;
  await applyResize(() => targetWindowSize(preset), label);
}

async function resizeToCustom(w, h) {
  state.recentCustom = { w, h };
  await saveRecentCustom();
  const label = `Custom · ${w} × ${h}`;
  await applyResize(
    () =>
      clampToScreen({
        width: w + state.chromeOffsets.dx,
        height: h + state.chromeOffsets.dy,
      }),
    label
  );
}

// -------- Status / stamp -----------------------------------------------------

let statusTimers = [];
function pulseStatusBar() {
  if (!els.statusBar) return;
  statusTimers.forEach(clearTimeout);
  statusTimers = [];
  els.statusBar.classList.remove("filling", "fading");
  void els.statusBar.offsetWidth; // reflow so the transition replays
  els.statusBar.classList.add("filling");
  statusTimers.push(
    setTimeout(() => {
      els.statusBar.classList.remove("filling");
      els.statusBar.classList.add("fading");
    }, 280)
  );
  statusTimers.push(
    setTimeout(() => {
      els.statusBar.classList.remove("fading");
    }, 560)
  );
}

// -------- Toast --------------------------------------------------------------

let toastTimer = null;
function showToast(message, { error = false } = {}) {
  els.toast.textContent = message;
  els.toast.classList.toggle("error", error);
  els.toast.classList.add("visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => els.toast.classList.remove("visible"),
    error ? 2400 : 1400
  );
}

// -------- Render -------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPresets() {
  const matched = findMatchedPreset();
  state.visibleList = PRESETS;
  if (state.selectedIndex >= PRESETS.length) state.selectedIndex = 0;

  const groups = [];
  const indexByGroup = new Map();
  PRESETS.forEach((p, i) => {
    if (!indexByGroup.has(p.group)) {
      indexByGroup.set(p.group, groups.length);
      groups.push({ name: p.group, items: [] });
    }
    groups[indexByGroup.get(p.group)].items.push({ preset: p, flatIndex: i });
  });

  let html = renderCustomRow();
  groups.forEach((g) => {
    html += `<div class="group">`;
    html += `<div class="group-header">${escapeHtml(g.name)}</div>`;
    g.items.forEach(({ preset: p, flatIndex }) => {
      const isCurrent = matched === p;
      const isSelected =
        state.showSelection && flatIndex === state.selectedIndex;
      const classes = ["preset"];
      if (isCurrent) classes.push("current");
      if (isSelected) classes.push("selected");
      const num = String(flatIndex + 1).padStart(2, "0");
      html +=
        `<button class="${classes.join(" ")}" data-index="${flatIndex}">` +
        `<span class="preset-num">${num}</span>` +
        `<span class="preset-name">${escapeHtml(p.name)}</span>` +
        `<span class="preset-dim">` +
        `<span class="dim-w">${p.w}</span>` +
        `<span class="dim-sep">×</span>` +
        `<span class="dim-h">${p.h}</span>` +
        `</span>` +
        `</button>`;
    });
    html += `</div>`;
  });
  els.presets.innerHTML = html;

  bindCustomInputs();

  const selectedEl = els.presets.querySelector(".preset.selected");
  if (selectedEl) selectedEl.scrollIntoView({ block: "nearest" });

  observeStickyHeaders();
}

function renderCustomRow() {
  const w = state.recentCustom?.w ?? "";
  const h = state.recentCustom?.h ?? "";
  const isCurrent = isCustomCurrent();
  const classes = ["preset", "custom-row"];
  if (isCurrent) classes.push("current");
  return (
    `<div class="${classes.join(" ")}">` +
    `<span class="preset-num"></span>` +
    `<span class="preset-name">Custom</span>` +
    `<span class="preset-dim">` +
    `<input class="dim-input" id="custom-w" type="text" inputmode="numeric" placeholder="0000" autocomplete="off" value="${w}" />` +
    `<span class="dim-sep">×</span>` +
    `<input class="dim-input" id="custom-h" type="text" inputmode="numeric" placeholder="0000" autocomplete="off" value="${h}" />` +
    `</span>` +
    `</div>`
  );
}

function parseDimInput(value) {
  const n = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < MIN_DIM || n > MAX_DIM) return null;
  return n;
}

function bindCustomInputs() {
  els.customW = document.getElementById("custom-w");
  els.customH = document.getElementById("custom-h");
  if (!els.customW || !els.customH) return;

  const onEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    void applyCustomFromInputs();
  };

  els.customW.addEventListener("keydown", onEnter);
  els.customH.addEventListener("keydown", onEnter);
}

async function applyCustomFromInputs() {
  const wInput = document.getElementById("custom-w");
  const hInput = document.getElementById("custom-h");
  if (!wInput || !hInput) return false;
  if (state.busy) return false;

  const w = parseDimInput(wInput.value);
  const h = parseDimInput(hInput.value);
  if (w !== null && h !== null) {
    await resizeToCustom(w, h);
    return true;
  }
  if (w === null) wInput.focus();
  else hInput.focus();
  return false;
}

let stickyObserver = null;
function observeStickyHeaders() {
  if (stickyObserver) stickyObserver.disconnect();
  const headers = els.presets.querySelectorAll(".group-header");
  if (!headers.length) return;
  stickyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("stuck", entry.intersectionRatio < 1);
      });
    },
    {
      root: els.presets,
      rootMargin: "-1px 0px 0px 0px",
      threshold: [1],
    }
  );
  headers.forEach((h) => stickyObserver.observe(h));
}

// -------- Selection ----------------------------------------------------------

function moveSelection(delta) {
  if (!state.visibleList.length) return;
  if (!state.showSelection) {
    state.showSelection = true;
    state.selectedIndex = delta > 0 ? 0 : state.visibleList.length - 1;
    renderPresets();
    return;
  }
  const len = state.visibleList.length;
  state.selectedIndex = (state.selectedIndex + delta + len) % len;
  renderPresets();
}

// -------- Type-to-resize -----------------------------------------------------

function clearTypeBuffer() {
  state.typeBuffer = "";
  if (typeTimer) {
    clearTimeout(typeTimer);
    typeTimer = null;
  }
}

function commitTypeBuffer() {
  const n = parseInt(state.typeBuffer, 10);
  clearTypeBuffer();
  if (!Number.isFinite(n) || n < 1) return;
  const preset = state.visibleList[n - 1];
  if (preset) resizeToPreset(preset);
}

function handleDigit(d) {
  if (d === "0" && state.typeBuffer === "") return;

  const max = state.visibleList.length;
  let tentative = state.typeBuffer + d;
  let n = parseInt(tentative, 10);

  // Extension would overflow the list — start fresh with just this digit.
  if (n > max) {
    state.typeBuffer = "";
    tentative = d;
    n = parseInt(tentative, 10);
    if (n < 1 || n > max) return;
  }
  if (n < 1) return;

  state.typeBuffer = tentative;
  state.showSelection = true;
  state.selectedIndex = n - 1;
  renderPresets();

  if (typeTimer) clearTimeout(typeTimer);

  // If a longer prefix could still match a preset, wait briefly for more digits.
  if (n * 10 <= max) {
    typeTimer = setTimeout(commitTypeBuffer, TYPE_WAIT_MS);
  } else {
    commitTypeBuffer();
  }
}

// -------- Events -------------------------------------------------------------

function wireEvents() {
  els.presets.addEventListener("click", (e) => {
    if (e.target.tagName === "INPUT") return;

    const customRow = e.target.closest(".custom-row");
    if (customRow) {
      if (els.customW) els.customW.focus();
      return;
    }

    const btn = e.target.closest(".preset[data-index]");
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    const preset = state.visibleList[idx];
    if (preset) resizeToPreset(preset);
  });

  document.addEventListener("keydown", (e) => {
    const target = e.target;
    const inCustom =
      target instanceof HTMLElement &&
      target.closest(".custom-row") !== null &&
      target.tagName === "INPUT";

    if (e.key === "Enter" && inCustom) {
      e.preventDefault();
      void applyCustomFromInputs();
      return;
    }

    if (e.key === "ArrowDown" && !inCustom) {
      e.preventDefault();
      clearTypeBuffer();
      moveSelection(1);
    } else if (e.key === "ArrowUp" && !inCustom) {
      e.preventDefault();
      clearTypeBuffer();
      moveSelection(-1);
    } else if (e.key === "Enter") {
      if (state.typeBuffer) {
        e.preventDefault();
        commitTypeBuffer();
        return;
      }
      if (!state.showSelection) return;
      e.preventDefault();
      const preset = state.visibleList[state.selectedIndex];
      if (preset) resizeToPreset(preset);
    } else if (e.key === "Escape") {
      if (state.typeBuffer) {
        e.preventDefault();
        clearTypeBuffer();
        state.showSelection = false;
        renderPresets();
      } else if (inCustom) {
        target.blur();
      }
    } else if (/^\d$/.test(e.key) && !inCustom) {
      e.preventDefault();
      handleDigit(e.key);
    }
  });
}

// -------- Init ---------------------------------------------------------------

async function init() {
  try {
    await refreshWindow();
    await Promise.all([measureViewportOffsets(), loadRecentCustom()]);
    renderPresets();
    wireEvents();
  } catch (e) {
    console.error("Init failed:", e);
    showToast("Failed to initialize", { error: true });
  }
}

init();
