// loop.ts — fixed-timestep simulation (20 ticks/sec) decoupled from rendering.
// Computes derived rates from upgrades, advances resources, drives phase
// transitions (detection -> decoding -> contact -> ending).

import * as audio from "./audio";
import {
  ACHIEVEMENTS,
  ARCHETYPES,
  computeEnding,
  ENDINGS,
  FRAGMENTS,
  GLYPH_MEANING,
  TRACKS,
  upgradeCost,
  upgradeById,
  type DialogueOption,
} from "./content";
import { game, lvl, unlockFeature } from "./state";

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

// ---------------------------------------------------------------------------
// Derived production — recomputed each frame for the UI; pure-ish.
// ---------------------------------------------------------------------------
export interface Derived {
  dataRate: number; // data per second
  computeRate: number; // compute per second
  noiseFloor: number; // 0..100 (lower is better)
  snrGain: number; // multiplier on SNR accumulation
  snrTarget: number; // where SNR settles given current gear
  decodeRate: number; // base decode work/sec available (phase 2)
  dishOutput: number; // raw per-dish output (for autoData)
}

export function computeDerived(): Derived {
  const dishes = lvl("dish");
  const cpus = lvl("cpu");

  // --- data ---
  let perDish = 0.5;
  perDish *= 1 + 0.25 * lvl("dishGain");
  let dataRate = dishes * perDish;
  // phased array: + sqrt(dishes) scaling
  dataRate += 0.05 * lvl("array") * Math.sqrt(Math.max(0, dishes));
  // wideband multiplier
  dataRate *= 1 + 0.15 * lvl("bandwidth");
  // servo automation bonus
  const dishOutput = dishes * perDish;
  dataRate += dishOutput * 0.02 * lvl("autoData");

  // --- compute ---
  // cores convert; also a small fraction of data becomes compute
  let computeRate = cpus * 0.3;
  computeRate += dataRate * 0.05; // throughput conversion
  computeRate *= 1 + 0.2 * lvl("cpuClock");

  // --- noise floor (lower better). Base 100, cryo + rfi reduce it. ---
  let noiseFloor = 100;
  noiseFloor *= Math.pow(0.93, lvl("cryo")); // each cryo level -7%
  noiseFloor *= 1 - 0.02 * lvl("rfi");
  noiseFloor = Math.max(2, noiseFloor);

  // --- SNR gain ---
  let snrGain = 1;
  snrGain *= 1 + 0.12 * lvl("filter");

  // Where SNR settles: scales with data throughput vs noise floor.
  // This is the core phase-1 chase: push throughput up, noise floor down.
  const throughputDb = Math.log10(1 + dataRate) * 10;
  const snrTarget = (throughputDb * snrGain * 100) / noiseFloor;

  // --- decode rate (phase 2): compute throughput drives decoding ---
  let decodeRate = (computeRate + game.compute * 0.0) * 6;
  decodeRate *= 1 + 0.18 * lvl("decoder");
  // heuristics: completed tracks accelerate
  const completed = TRACKS.filter((t) => (game.tracks[t.id] ?? 0) >= 1).length;
  decodeRate *= 1 + 0.06 * lvl("heuristics") * completed;

  return { dataRate, computeRate, noiseFloor, snrGain, snrTarget, decodeRate, dishOutput };
}

// ---------------------------------------------------------------------------
// Events surfaced to the UI layer (toasts, narrative typing, sound triggers).
// ---------------------------------------------------------------------------
export type GameEvent =
  | { type: "phase"; phase: string }
  | { type: "detect" }
  | { type: "track"; id: string }
  | { type: "fragment"; index: number }
  | { type: "glyph"; glyph: string }
  | { type: "achievement"; id: string }
  | { type: "toast"; text: string }
  | { type: "ending"; id: string }
  | { type: "alienReply"; text: string };

let eventQueue: GameEvent[] = [];
export function drainEvents(): GameEvent[] {
  const e = eventQueue;
  eventQueue = [];
  return e;
}
function emit(e: GameEvent): void {
  eventQueue.push(e);
}

// ---------------------------------------------------------------------------
// The tick.
// ---------------------------------------------------------------------------
let autoBuyTimer = 0;
let tickTickTimer = 0;

export function tick(dt: number): void {
  game.ticks++;
  game.lastTick = Date.now();
  const d = computeDerived();

  // ---- resource accumulation ----
  const dGain = d.dataRate * dt;
  const cGain = d.computeRate * dt;
  game.data += dGain;
  game.compute += cGain;
  game.totalDataEver += dGain;
  game.totalComputeEver += cGain;

  // ---- SNR relaxes toward target ----
  game.snr += (d.snrTarget - game.snr) * Math.min(1, dt * 0.5);
  if (game.snr < 0) game.snr = 0;

  // ---- ambient audio intensity tracks noise floor ----
  audio.setHissIntensity(Math.min(1, d.noiseFloor / 100));

  // ---- phase-specific logic ----
  if (game.phase === "listening") tickListening(d, dt);
  else if (game.phase === "decoding") tickDecoding(d, dt);
  // contact resolves via player actions, not ticks (see chooseDialogue)

  // ---- automation: procurement AI auto-buys dishes ----
  if (lvl("autoBuy") > 0) {
    autoBuyTimer += dt;
    const interval = Math.max(1, 6 - lvl("autoBuy"));
    if (autoBuyTimer >= interval) {
      autoBuyTimer = 0;
      tryBuy("dish", 1, true);
    }
  }

  // ---- achievements ----
  checkAchievements();
}

function tickListening(_d: Derived, dt: number): void {
  // The anomaly becomes detectable once SNR clears a detection threshold.
  // The threshold itself is the noise floor scaled. Player builds "charge"
  // while SNR exceeds it; charge confirms detection.
  const detectThreshold = 40; // SNR units needed to even register
  if (game.snr >= detectThreshold) {
    const over = (game.snr - detectThreshold) / detectThreshold; // >0
    const rate = 0.02 + Math.min(0.12, over * 0.05);
    game.anomalyCharge = Math.min(1, game.anomalyCharge + rate * dt);

    // Geiger ticks as we close in.
    tickTickTimer += dt;
    const tickInterval = Math.max(0.12, 1.2 - game.anomalyCharge * 1.1);
    if (tickTickTimer >= tickInterval) {
      tickTickTimer = 0;
      audio.tick(0.5 + game.anomalyCharge * 0.6);
    }

    if (game.anomalyCharge >= 1 && !game.detected) {
      confirmDetection();
    }
  } else {
    // decays slowly if SNR drops below threshold
    game.anomalyCharge = Math.max(0, game.anomalyCharge - 0.01 * dt);
  }
}

function confirmDetection(): void {
  game.detected = true;
  audio.detectionStinger();
  emit({ type: "detect" });
  emit({ type: "toast", text: "ANOMALY CONFIRMED — repeating non-natural source." });
  // transition to decoding
  transitionTo("decoding");
  // seed allocations evenly across the first available track
  if (Object.keys(game.alloc).length === 0) {
    game.alloc = { carrier: 1 };
  }
}

function tickDecoding(d: Derived, dt: number): void {
  // Allocate decode throughput across tracks per game.alloc fractions.
  // Only unlocked (requirements met) and incomplete tracks accept work.
  const available = TRACKS.filter((t) => {
    const done = (game.tracks[t.id] ?? 0) >= 1;
    if (done) return false;
    if (t.requires && (game.tracks[t.requires] ?? 0) < 1) return false;
    return true;
  });
  if (available.length === 0) {
    // everything decoded -> comprehension -> contact
    maybeEnterContact();
    return;
  }

  // normalize allocation across available tracks
  let totalAlloc = 0;
  for (const t of available) totalAlloc += game.alloc[t.id] ?? 0;
  if (totalAlloc <= 0) {
    // default: dump everything into the first available track
    game.alloc[available[0].id] = 1;
    totalAlloc = 1;
  }

  const totalWork = d.decodeRate * dt;
  for (const t of available) {
    const frac = (game.alloc[t.id] ?? 0) / totalAlloc;
    if (frac <= 0) continue;
    const cur = game.tracks[t.id] ?? 0;
    const add = (totalWork * frac) / t.work;
    const next = Math.min(1, cur + add);
    game.tracks[t.id] = next;
    if (cur < 1 && next >= 1) completeTrack(t.id);
  }

  // comprehension fragment / contact entry handled when last track done
  maybeEnterContact();
}

function completeTrack(id: string): void {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) return;
  audio.chirp();
  emit({ type: "track", id });

  // glyphs
  if (t.glyphs) {
    for (const g of t.glyphs) {
      if (!game.glyphs.includes(g)) {
        game.glyphs.push(g);
        emit({ type: "glyph", glyph: g });
      }
    }
  }
  // fragment
  if (t.fragment !== undefined && t.fragment >= game.fragments) {
    game.fragments = t.fragment + 1;
    emit({ type: "fragment", index: t.fragment });
  }
  // insight reward (scaled by lexicon engine)
  const mult = 1 + 0.25 * lvl("lexicon");
  game.insight += t.insight * mult;
  emit({ type: "toast", text: `DECODED: ${t.name} (+${(t.insight * mult).toFixed(0)} insight)` });
}

function maybeEnterContact(): void {
  const comp = game.tracks["comprehension"] ?? 0;
  if (comp >= 1 && game.phase === "decoding") {
    // Choose the alien archetype now (stable, seeded by play history a bit).
    const idx = pickArchetypeIndex();
    const arch = ARCHETYPES[idx];
    game.contact.archetype = arch.id;
    game.contact.alienDisposition = arch.disposition;
    game.contact.node = "intro";
    audio.signalTone(523.25, 0.8);
    transitionTo("contact");
    emit({ type: "toast", text: "TWO-WAY CHANNEL OPEN. It is answering." });
  }
}

function pickArchetypeIndex(): number {
  // Pseudo-random but deterministic per save: hash of startedAt.
  const seed = Math.floor(game.startedAt / 1000) ^ Math.floor(game.totalDataEver);
  let x = (seed % 2147483647);
  if (x <= 0) x += 2147483646;
  x = (x * 48271) % 2147483647;
  return x % ARCHETYPES.length;
}

function transitionTo(phase: string): void {
  game.phase = phase as any;
  unlockFeature("phase:" + phase);
  emit({ type: "phase", phase });
}

// ---------------------------------------------------------------------------
// PURCHASING
// ---------------------------------------------------------------------------
export interface BuyResult {
  bought: number;
  spent: number;
}

/** How many levels are affordable, capped by maxLevel and a hard cap. */
export function affordable(id: string, mode: 1 | 10 | 100 | "max"): number {
  const def = upgradeById(id);
  if (!def) return 0;
  const cur = lvl(id);
  const remaining = def.maxLevel !== undefined ? def.maxLevel - cur : Infinity;
  if (remaining <= 0) return 0;
  const wallet = walletFor(def.cost);

  const want = mode === "max" ? 9999 : mode;
  let count = 0;
  let total = 0;
  let level = cur;
  while (count < want && count < remaining) {
    const c = upgradeCost(def, level);
    if (total + c > wallet) break;
    total += c;
    level++;
    count++;
  }
  return count;
}

/** Total cost to buy `n` levels from current. */
export function bulkCost(id: string, n: number): number {
  const def = upgradeById(id);
  if (!def) return 0;
  const cur = lvl(id);
  let total = 0;
  for (let i = 0; i < n; i++) total += upgradeCost(def, cur + i);
  return total;
}

function walletFor(kind: string): number {
  if (kind === "data") return game.data;
  if (kind === "compute") return game.compute;
  if (kind === "insight") return game.insight;
  return 0;
}
function spend(kind: string, amount: number): void {
  if (kind === "data") game.data -= amount;
  else if (kind === "compute") game.compute -= amount;
  else if (kind === "insight") game.insight -= amount;
}

export function tryBuy(id: string, n: number, silent = false): BuyResult {
  const def = upgradeById(id);
  if (!def) return { bought: 0, spent: 0 };
  const cur = lvl(id);
  const remaining = def.maxLevel !== undefined ? def.maxLevel - cur : Infinity;
  let want = Math.min(n, remaining);
  if (want <= 0) {
    if (!silent) audio.buzz();
    return { bought: 0, spent: 0 };
  }
  const cost = bulkCost(id, want);
  if (cost > walletFor(def.cost)) {
    if (!silent) audio.buzz();
    return { bought: 0, spent: 0 };
  }
  spend(def.cost, cost);
  game.upgrades[id] = cur + want;
  if (!silent) audio.beep();
  return { bought: want, spent: cost };
}

/** Buy according to the current buy-mode. */
export function buyMode(id: string): BuyResult {
  const mode = game.settings.buyMode;
  if (mode === "max") {
    const n = affordable(id, "max");
    return tryBuy(id, Math.max(0, n));
  }
  return tryBuy(id, mode);
}

// ---------------------------------------------------------------------------
// ALLOCATION (phase 2)
// ---------------------------------------------------------------------------
export function setAlloc(id: string, value: number): void {
  game.alloc[id] = Math.max(0, value);
}

// ---------------------------------------------------------------------------
// CONTACT — player chooses a dialogue option; we resolve trust & inference.
// ---------------------------------------------------------------------------
export function chooseDialogue(opt: DialogueOption): void {
  const c = game.contact;
  const arch = ARCHETYPES.find((a) => a.id === c.archetype);
  if (!arch) return;

  // Base trust delta from archetype weights.
  let delta: number;
  if (arch.id === "mirror") {
    // Mirror rewards consistency with the player's dominant prior tag.
    const counts: Record<string, number> = {};
    for (const h of c.history) counts[h] = (counts[h] ?? 0) + 1;
    let dom = opt.tag;
    let best = -1;
    for (const k in counts) if (counts[k] > best) { best = counts[k]; dom = k; }
    delta = opt.tag === dom ? 8 : -5;
  } else {
    delta = arch.weights[opt.tag] ?? 0;
  }

  // Soften losses via Semantic Model upgrade.
  if (delta < 0) delta *= 1 - 0.04 * lvl("semantics");

  // Transmitter speeds exchanges (flavor) — small trust bonus to cooperation tempo.
  c.trust += delta;
  c.trust = Math.max(-100, Math.min(100, c.trust));
  c.exposure = Math.min(1, c.exposure + opt.exposure);
  c.comprehension = Math.min(1, c.comprehension + 0.18 + 0.02 * lvl("inference"));
  c.exchanges++;
  c.history.push(opt.tag);

  // Inference: with enough comprehension + inference upgrade, reveal archetype.
  const clarity = c.comprehension + 0.08 * lvl("inference");
  if (!c.archetypeRevealed && clarity >= 0.75 && c.exchanges >= 2) {
    c.archetypeRevealed = true;
    emit({ type: "toast", text: `INFERENCE: it is ${arch.name}.` });
  }

  audio.signalTone(392 + delta * 4, 0.4);

  // Advance node or resolve to ending.
  if (opt.next === "resolve") {
    resolveEnding();
  } else {
    c.node = opt.next;
    emit({ type: "alienReply", text: replyFlavor(delta) });
  }
}

function replyFlavor(delta: number): string {
  if (delta >= 8) return "◇ ...the channel WARMS. It leans closer. ◇";
  if (delta > 0) return "◇ ...a pulse of assent. It continues. ◇";
  if (delta === 0) return "◇ ...no change. It weighs you in silence. ◇";
  if (delta > -8) return "◇ ...the tone COOLS. Something recoils. ◇";
  return "◇ ...a harsh discordance. You have given offense. ◇";
}

function resolveEnding(): void {
  const ending = computeEnding(game);
  game.contact.ending = ending.id;
  transitionTo("ended");
  emit({ type: "ending", id: ending.id });
  if (ending.tone === "good") audio.signalTone(659.25, 1.2);
  else if (ending.tone === "bad") audio.buzz();
  else audio.signalTone(440, 0.8);
}

// expose endings/fragments for UI imports convenience
export { ENDINGS, FRAGMENTS, GLYPH_MEANING };

// ---------------------------------------------------------------------------
// ACHIEVEMENTS
// ---------------------------------------------------------------------------
function checkAchievements(): void {
  for (const a of ACHIEVEMENTS) {
    if (game.achievements.includes(a.id)) continue;
    if (a.check(game)) {
      game.achievements.push(a.id);
      emit({ type: "achievement", id: a.id });
    }
  }
}
