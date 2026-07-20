const HISTORY_LIMIT = 20;
const HISTORY_KEY = (windowId) => `history_${windowId}`;
const ANIMATION_MS = 280;
// Minimum gap between frames. The real cadence is dominated by the awaited
// window-update round-trip, so this just caps the rate — a handful of frames
// that each actually land reads smoother than a flood the OS coalesces away.
const FRAME_MIN_MS = 24;
const SIZE_TOLERANCE = 3;
const STATE_POLL_MS = 50;
// Exiting a macOS fullscreen space is a long animated transition.
const FULLSCREEN_SETTLE_TIMEOUT_MS = 1500;

const activeResizes = new Set();

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function updateWindow(windowId, props) {
  return new Promise((resolve) => {
    chrome.windows.update(windowId, props, () => {
      resolve(chrome.runtime.lastError || null);
    });
  });
}

// Apply the final size and report what the OS actually granted. Retries only
// while the window is still moving toward the target; if the size stops
// changing, the OS is clamping (e.g. Chrome's ~500px minimum window width), so
// we accept it instead of re-asserting the unreachable target — which is what
// produced the end-of-resize bounce.
async function settleWindowSize(windowId, width, height) {
  let prev = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await updateWindow(windowId, { width, height });
    let win;
    try {
      win = await chrome.windows.get(windowId);
    } catch (e) {
      return { ok: false };
    }
    const settled =
      Math.abs(win.width - width) <= SIZE_TOLERANCE &&
      Math.abs(win.height - height) <= SIZE_TOLERANCE;
    const stalled =
      prev && prev.width === win.width && prev.height === win.height;
    if (settled || stalled) {
      return { ok: true, width: win.width, height: win.height };
    }
    prev = { width: win.width, height: win.height };
    await sleep(40);
  }
  try {
    const win = await chrome.windows.get(windowId);
    return { ok: true, width: win.width, height: win.height };
  } catch (e) {
    return { ok: false };
  }
}

// Wait until a state change has actually landed: state is "normal" and bounds
// (including origin) are identical across two consecutive polls. macOS applies
// the fullscreen exit asynchronously, well after the update call resolves;
// animating before quiescence lets the late-landing restore fight the
// animation. On timeout, return the latest read and proceed — worst case the
// animation starts from wherever the window is, never a hang.
async function waitForNormalBounds(windowId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let prev = null;
  let win = await chrome.windows.get(windowId);
  while (Date.now() < deadline) {
    if (
      win.state === "normal" &&
      prev &&
      prev.width === win.width &&
      prev.height === win.height &&
      prev.left === win.left &&
      prev.top === win.top
    ) {
      return win;
    }
    prev = win;
    await sleep(STATE_POLL_MS);
    win = await chrome.windows.get(windowId);
  }
  return win;
}

async function animateResize(windowId, target, snapshot, reducedMotion = false) {
  if (activeResizes.has(windowId)) {
    return { ok: false, error: "busy" };
  }
  activeResizes.add(windowId);
  try {
    await pushHistory(windowId, snapshot);

    let win = await chrome.windows.get(windowId);
    if (win.state === "fullscreen") {
      // Bounds updates are ignored while in a macOS fullscreen space, so exit
      // first and wait out the space transition before animating.
      await updateWindow(windowId, { state: "normal" });
      win = await waitForNormalBounds(windowId, FULLSCREEN_SETTLE_TIMEOUT_MS);
    }
    // A maximized/zoomed window needs no state handling at all: the first
    // bounds update implicitly returns it to "normal" at exactly the size we
    // ask for, in place. Explicitly setting {state:"normal"} instead invites
    // macOS's asynchronous un-zoom restore, which lands late and fights the
    // animation (the size→full→size bounce).

    const endW = target.width;
    const endH = target.height;

    if (reducedMotion) {
      return await settleWindowSize(windowId, endW, endH);
    }

    const startW = win.width;
    const startH = win.height;

    if (startW === endW && startH === endH) {
      return { ok: true, width: startW, height: startH };
    }

    // Eased position is driven by the wall clock (so width and height always
    // move off the same progress value — they can't desync), and each frame is
    // AWAITED so the window manager finishes one resize before the next is
    // requested. Awaiting is what keeps it smooth: firing faster than the OS
    // can resize just gets coalesced into choppy jumps. The awaited round-trip
    // plus the frame floor settles into a handful of clean frames over 280ms.
    const startTime = Date.now();
    let lastW = startW;
    let lastH = startH;
    let t = 0;
    while (t < 1) {
      t = Math.min(1, (Date.now() - startTime) / ANIMATION_MS);
      const eased = easeOutCubic(t);
      const w = Math.round(startW + (endW - startW) * eased);
      const h = Math.round(startH + (endH - startH) * eased);
      if (w !== lastW || h !== lastH) {
        await updateWindow(windowId, { width: w, height: h });
        lastW = w;
        lastH = h;
      }
      if (t < 1) await sleep(FRAME_MIN_MS);
    }

    // Settle lands the exact target and reports the size the OS actually
    // granted (it accepts an OS clamp instead of fighting it).
    return await settleWindowSize(windowId, endW, endH);
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    activeResizes.delete(windowId);
  }
}

async function getHistory(windowId) {
  const key = HISTORY_KEY(windowId);
  const result = await chrome.storage.session.get(key);
  return result[key] || { past: [], future: [] };
}

async function setHistory(windowId, history) {
  await chrome.storage.session.set({ [HISTORY_KEY(windowId)]: history });
}

async function pushHistory(windowId, snapshot) {
  const history = await getHistory(windowId);
  history.past.push(snapshot);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  await setHistory(windowId, history);
}

async function snapshotWindow(windowId) {
  const win = await chrome.windows.get(windowId);
  return {
    width: win.width,
    height: win.height,
    left: win.left,
    top: win.top,
    state: win.state,
  };
}

async function applySnapshot(windowId, snapshot) {
  try {
    const current = await chrome.windows.get(windowId);
    if (current.state === "fullscreen") {
      await updateWindow(windowId, { state: "normal" });
      await waitForNormalBounds(windowId, FULLSCREEN_SETTLE_TIMEOUT_MS);
    }
  } catch (e) {
    return;
  }
  await chrome.windows.update(windowId, {
    width: snapshot.width,
    height: snapshot.height,
    left: snapshot.left,
    top: snapshot.top,
  });
  if (snapshot.state && snapshot.state !== "normal") {
    await chrome.windows.update(windowId, { state: snapshot.state });
  }
}

async function undo(windowId) {
  const history = await getHistory(windowId);
  if (!history.past.length) return false;
  const current = await snapshotWindow(windowId);
  const previous = history.past.pop();
  history.future.push(current);
  await setHistory(windowId, history);
  await applySnapshot(windowId, previous);
  return true;
}

async function redo(windowId) {
  const history = await getHistory(windowId);
  if (!history.future.length) return false;
  const current = await snapshotWindow(windowId);
  const next = history.future.pop();
  history.past.push(current);
  await setHistory(windowId, history);
  await applySnapshot(windowId, next);
  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "push_history") {
        await pushHistory(message.windowId, message.snapshot);
        sendResponse({ ok: true });
      } else if (message.type === "undo") {
        const ok = await undo(message.windowId);
        sendResponse({ ok });
      } else if (message.type === "redo") {
        const ok = await redo(message.windowId);
        sendResponse({ ok });
      } else if (message.type === "get_history") {
        const history = await getHistory(message.windowId);
        sendResponse({
          canUndo: history.past.length > 0,
          canRedo: history.future.length > 0,
        });
      } else if (message.type === "resize_window") {
        const result = await animateResize(
          message.windowId,
          message.target,
          message.snapshot,
          message.reducedMotion
        );
        sendResponse(result);
      }
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  const win = await chrome.windows.getCurrent();
  if (command === "undo") {
    await undo(win.id);
  } else if (command === "redo") {
    await redo(win.id);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  await chrome.storage.session.remove(HISTORY_KEY(windowId));
});
