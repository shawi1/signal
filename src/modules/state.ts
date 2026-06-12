// state.ts — the single serializable game state and derived-value helpers.

export type Phase = "listening" | "decoding" | "contact" | "ended";

export type Theme = "phosphor" | "amber";

/** Per-upgrade purchased levels, keyed by upgrade id. */
export type UpgradeLevels = Record<string, number>;

/** Decode track progress, keyed by track id (0..1 completion). */
export type TrackProgress = Record<string, number>;

export interface ContactState {
  // Trust ranges roughly -100..+100. Starts at 0 (cautious neutral).
  trust: number;
  // Player's running estimate of the alien's intent (inferred).
  // We track the TRUE hidden utility weights and the player's belief.
  // alien hidden disposition: -1 (hostile) .. +1 (benevolent)
  alienDisposition: number;
  // How much the player has revealed about Earth (0..1). Higher = riskier.
  exposure: number;
  // How much the alien has revealed (0..1). Higher = more inference data.
  comprehension: number;
  // Number of exchanges completed.
  exchanges: number;
  // Log of exchange ids the player has chosen (for endings / achievements).
  history: string[];
  // The alien archetype, hidden until revealed by inference. Chosen at contact start.
  archetype: string;
  // Whether the player has correctly identified the archetype.
  archetypeRevealed: boolean;
  // Pending alien prompt id (which dialogue node we are on).
  node: string;
  // Set when an ending has been locked in.
  ending: string | null;
}

export interface Settings {
  theme: Theme;
  muted: boolean;
  buyMode: 1 | 10 | 100 | "max";
  crtEffects: boolean;
}

export interface GameState {
  version: number;
  phase: Phase;

  // ---- Core resources ----
  data: number; // raw captured data samples
  compute: number; // accumulated compute (spendable / used as currency)
  insight: number; // phase-2+ meta currency earned from decoding
  // Signal-to-noise: the key phase-1 metric. Player pushes this up.
  snr: number;

  // ---- Allocations (phase 2) ----
  // Fraction of compute throughput allocated to each decode track.
  alloc: Record<string, number>;

  // ---- Progression ----
  upgrades: UpgradeLevels;
  tracks: TrackProgress;
  glyphs: string[]; // lexicon entries unlocked (ids)
  fragments: number; // narrative message fragments revealed
  achievements: string[]; // unlocked achievement ids
  unlockedFeatures: string[]; // generic feature flags

  // ---- Phase 1 detection ----
  anomalyCharge: number; // 0..1 progress toward confirming the anomaly
  detected: boolean;

  // ---- Phase 3 ----
  contact: ContactState;

  // ---- Bookkeeping ----
  settings: Settings;
  lastSaved: number; // epoch ms
  lastTick: number; // epoch ms of last processed tick
  startedAt: number;
  totalDataEver: number;
  totalComputeEver: number;
  ticks: number;
  // transient (not really meant to be relied on after load): seen-intro
  seenIntro: boolean;
}

export const SAVE_KEY = "signal.save.v1";
export const STATE_VERSION = 1;

export function defaultContact(): ContactState {
  return {
    trust: 0,
    alienDisposition: 0,
    exposure: 0,
    comprehension: 0,
    exchanges: 0,
    history: [],
    archetype: "",
    archetypeRevealed: false,
    node: "intro",
    ending: null,
  };
}

export function defaultState(): GameState {
  const now = Date.now();
  return {
    version: STATE_VERSION,
    phase: "listening",
    data: 0,
    compute: 0,
    insight: 0,
    snr: 0,
    alloc: {},
    upgrades: {},
    tracks: {},
    glyphs: [],
    fragments: 0,
    achievements: [],
    unlockedFeatures: [],
    anomalyCharge: 0,
    detected: false,
    contact: defaultContact(),
    settings: {
      theme: "phosphor",
      muted: true, // start muted; user opts into audio
      buyMode: 1,
      crtEffects: true,
    },
    lastSaved: now,
    lastTick: now,
    startedAt: now,
    totalDataEver: 0,
    totalComputeEver: 0,
    ticks: 0,
    seenIntro: false,
  };
}

/** The live mutable state singleton. */
export let game: GameState = defaultState();

export function setGame(s: GameState): void {
  game = s;
}

/** Level of an upgrade (0 if never bought). */
export function lvl(id: string): number {
  return game.upgrades[id] ?? 0;
}

export function hasFeature(id: string): boolean {
  return game.unlockedFeatures.includes(id);
}

export function unlockFeature(id: string): void {
  if (!game.unlockedFeatures.includes(id)) game.unlockedFeatures.push(id);
}
