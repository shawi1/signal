// main.ts — entry point. Boots the engine, reconciles offline progress, starts
// the fixed-timestep simulation and the rAF render loop, wires autosave and the
// first-gesture audio unlock.

import "./styles.css";
import * as audio from "./modules/audio";
import { computeDerived, tick, TICK_MS } from "./modules/loop";
import { fmt, fmtTime } from "./modules/format";
import { loadGame, offlineProgress, saveNow } from "./modules/save";
import { game } from "./modules/state";
import { buildUI, showToast, update } from "./ui/app";

function boot(): void {
  loadGame();

  // Offline progress: advance with rates frozen at load.
  const d = computeDerived();
  const summary = offlineProgress(d.dataRate, d.computeRate);

  buildUI();

  if (summary) {
    showToast(
      `WHILE YOU WERE AWAY (${fmtTime(summary.elapsed)}${summary.capped ? ", capped" : ""}): ` +
        `+${fmt(summary.data)} DATA, +${fmt(summary.compute)} COMPUTE @60%`,
      8000,
    );
  }

  startSim();
  startRender();
  startAutosave();
  wireGesture();
  wireKeys();
}

// ---- fixed-timestep simulation (accumulator) ----
let acc = 0;
let prev = performance.now();
function startSim(): void {
  prev = performance.now();
  setInterval(() => {
    const now = performance.now();
    let frame = now - prev;
    prev = now;
    if (frame > 1000) frame = 1000; // clamp huge gaps (tab was hidden)
    acc += frame;
    let guard = 0;
    while (acc >= TICK_MS && guard < 200) {
      tick(TICK_MS / 1000);
      acc -= TICK_MS;
      guard++;
    }
  }, TICK_MS);
}

// ---- render loop (decoupled, requestAnimationFrame) ----
function startRender(): void {
  const frame = (): void => {
    update();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---- autosave + save on unload ----
function startAutosave(): void {
  setInterval(saveNow, 10000);
  window.addEventListener("beforeunload", saveNow);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveNow();
  });
}

// ---- audio unlock on first gesture (browsers require it) ----
function wireGesture(): void {
  const unlock = (): void => {
    if (!game.settings.muted) {
      audio.startAmbient();
      audio.applyMute();
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

// ---- keyboard niceties ----
function wireKeys(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const bg = document.getElementById("modal-bg");
      bg?.classList.remove("show");
    }
  });
}

boot();
