// save.ts — persistence, export/import, and offline-progress reconciliation.

import {
  defaultState,
  game,
  SAVE_KEY,
  setGame,
  STATE_VERSION,
  type GameState,
} from "./state";

/** Deep-merge loaded save over defaults so new fields are filled in. */
function reconcile(loaded: Partial<GameState>): GameState {
  const base = defaultState();
  const merged: any = { ...base };
  for (const k in loaded) {
    const v = (loaded as any)[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      merged[k] = { ...(base as any)[k], ...v };
    } else if (v !== undefined) {
      merged[k] = v;
    }
  }
  merged.version = STATE_VERSION;
  return merged as GameState;
}

export function saveNow(): void {
  game.lastSaved = Date.now();
  try {
    const json = JSON.stringify(game);
    localStorage.setItem(SAVE_KEY, json);
  } catch (e) {
    console.warn("save failed", e);
  }
}

/** Load from localStorage, returns true if a save existed. */
export function loadGame(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    setGame(reconcile(parsed));
    return true;
  } catch (e) {
    console.warn("load failed, starting fresh", e);
    return false;
  }
}

export function hardReset(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  setGame(defaultState());
}

/** Export the save as a base64 string for the clipboard. */
export function exportSave(): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(game))));
  } catch {
    return "";
  }
}

/** Import a base64 save string. Returns true on success. */
export function importSave(b64: string): boolean {
  try {
    const json = decodeURIComponent(escape(atob(b64.trim())));
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return false;
    setGame(reconcile(parsed));
    saveNow();
    return true;
  } catch {
    return false;
  }
}

export interface OfflineSummary {
  elapsed: number; // seconds
  data: number;
  compute: number;
  capped: boolean;
}

/**
 * Compute offline progress. We approximate by advancing the sim with the
 * production rates frozen at load time, capped to MAX_OFFLINE seconds.
 * The caller (loop) supplies current per-second rates.
 */
export const MAX_OFFLINE = 8 * 3600; // 8 hours cap

export function offlineProgress(dataRate: number, computeRate: number): OfflineSummary | null {
  const now = Date.now();
  const elapsedMs = now - game.lastTick;
  const elapsed = elapsedMs / 1000;
  game.lastTick = now;
  if (elapsed < 30) return null; // ignore trivial gaps

  const capped = elapsed > MAX_OFFLINE;
  const eff = Math.min(elapsed, MAX_OFFLINE);
  // Offline is at 60% efficiency — encourages active play (cookie-clicker style).
  const factor = eff * 0.6;
  const dGain = dataRate * factor;
  const cGain = computeRate * factor;

  game.data += dGain;
  game.compute += cGain;
  game.totalDataEver += dGain;
  game.totalComputeEver += cGain;

  return { elapsed, data: dGain, compute: cGain, capped };
}
