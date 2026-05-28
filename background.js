const HISTORY_LIMIT = 20;
const HISTORY_KEY = (windowId) => `history_${windowId}`;
const ANIMATION_MS = 320;
const ANIMATION_STEPS = 10;
const MIN_STEP_MS = 16;
const SIZE_TOLERANCE = 3;

const activeResizes = new Set();

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function updateWindow(windowId, props) {
  return new Promise((resolve) => {
    chrome.windows.update(windowId, props, () => {
      resolve(chrome.runtime.lastError || null);
    });
  });
}

async function ensureWindowSize(windowId, width, height) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await updateWindow(windowId, { width, height });
    await new Promise((r) => setTimeout(r, 60));
    try {
      const win = await chrome.windows.get(windowId);
      if (
        Math.abs(win.width - width) <= SIZE_TOLERANCE &&
        Math.abs(win.height - height) <= SIZE_TOLERANCE
      ) {
        return { ok: true, width: win.width, height: win.height };
      }
    } catch (e) {
      return { ok: false };
    }
  }
  try {
    const win = await chrome.windows.get(windowId);
    return { ok: true, width: win.width, height: win.height };
  } catch (e) {
    return { ok: false };
  }
}

async function animateResize(windowId, target, snapshot, reducedMotion = false) {
  if (activeResizes.has(windowId)) {
    return { ok: false, error: "busy" };
  }
  activeResizes.add(windowId);
  try {
    await pushHistory(windowId, snapshot);

    let win = await chrome.windows.get(windowId);
    if (win.state !== "normal") {
      await updateWindow(windowId, { state: "normal" });
      await new Promise((r) => setTimeout(r, 80));
      win = await chrome.windows.get(windowId);
    }

    const endW = target.width;
    const endH = target.height;

    if (reducedMotion) {
      return await ensureWindowSize(windowId, endW, endH);
    }

    const startW = win.width;
    const startH = win.height;
    const startTime = Date.now();
    let lastW = startW;
    let lastH = startH;

    for (let i = 1; i <= ANIMATION_STEPS; i++) {
      const t = i / ANIMATION_STEPS;
      const eased = easeOutCubic(t);
      const w = Math.round(startW + (endW - startW) * eased);
      const h = Math.round(startH + (endH - startH) * eased);

      if (w !== lastW || h !== lastH) {
        await updateWindow(windowId, { width: w, height: h });
        lastW = w;
        lastH = h;
      }

      const elapsed = Date.now() - startTime;
      const targetTime = (ANIMATION_MS * i) / ANIMATION_STEPS;
      const wait = Math.max(MIN_STEP_MS, targetTime - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }

    win = await chrome.windows.get(windowId);
    if (
      Math.abs(win.width - endW) <= SIZE_TOLERANCE &&
      Math.abs(win.height - endH) <= SIZE_TOLERANCE
    ) {
      return { ok: true, width: win.width, height: win.height };
    }
    return await ensureWindowSize(windowId, endW, endH);
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
    if (current.state !== "normal") {
      await chrome.windows.update(windowId, { state: "normal" });
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
