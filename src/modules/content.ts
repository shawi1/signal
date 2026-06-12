// content.ts — DATA-DRIVEN game content: upgrades, decode tracks, glyphs,
// message fragments, achievements, and the contact dialogue tree.
//
// All balance lives here. The engine (loop.ts) reads these definitions and
// applies their effects. Keep effects as pure functions of state where possible.

import { game, lvl, type GameState } from "./state";

// ---------------------------------------------------------------------------
// UPGRADES
// ---------------------------------------------------------------------------
// Each upgrade has a cost curve and an effect. `kind` tags which resource it
// is bought with. `effectKind` lets the engine aggregate multipliers cheaply.

export type ResourceKind = "data" | "compute" | "insight";

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  // resource spent
  cost: ResourceKind;
  baseCost: number;
  costMult: number; // geometric growth per level
  maxLevel?: number; // omit for infinite
  // which phase(s) this is visible in
  phases: string[];
  // unlock predicate
  unlocked: (g: GameState) => boolean;
  // short tag describing effect for tooltip "+x per level"
  effectText: (level: number) => string;
  // category grouping for UI
  group: string;
}

export const UPGRADES: UpgradeDef[] = [
  // ---- DISHES: produce raw data ----
  {
    id: "dish",
    name: "Parabolic Dish",
    desc: "Each dish captures more cosmic samples per second.",
    cost: "data",
    baseCost: 10,
    costMult: 1.15,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => true,
    effectText: (l) => `+${(0.5).toFixed(2)} data/s each (owned: ${l})`,
    group: "Antenna Array",
  },
  {
    id: "dishGain",
    name: "Feedhorn Tuning",
    desc: "Improves the gain of every dish. Multiplies data output.",
    cost: "data",
    baseCost: 200,
    costMult: 1.6,
    maxLevel: 30,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("dish") >= 5,
    effectText: (l) => `dish output x${(1 + 0.25 * l).toFixed(2)}`,
    group: "Antenna Array",
  },
  {
    id: "bandwidth",
    name: "Wideband Receiver",
    desc: "Wider bandwidth captures more channels at once.",
    cost: "data",
    baseCost: 1200,
    costMult: 1.9,
    maxLevel: 25,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("dish") >= 10,
    effectText: (l) => `all data x${(1 + 0.15 * l).toFixed(2)}`,
    group: "Antenna Array",
  },
  {
    id: "array",
    name: "Phased Array Link",
    desc: "Interferometry links dishes — output scales with the square root of dish count.",
    cost: "compute",
    baseCost: 50,
    costMult: 2.2,
    maxLevel: 20,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("dish") >= 20,
    effectText: (l) => `+${(0.05 * l).toFixed(2)}·√dishes data/s`,
    group: "Antenna Array",
  },

  // ---- COMPUTE: data -> compute conversion & raw compute ----
  {
    id: "cpu",
    name: "Correlator Core",
    desc: "Processing cores convert raw data into usable compute.",
    cost: "data",
    baseCost: 50,
    costMult: 1.2,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("dish") >= 3,
    effectText: (l) => `+${(0.3).toFixed(2)} compute/s each (owned: ${l})`,
    group: "Compute",
  },
  {
    id: "cpuClock",
    name: "Overclock",
    desc: "Push the correlator clock. Multiplies all compute generation.",
    cost: "compute",
    baseCost: 30,
    costMult: 1.7,
    maxLevel: 30,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("cpu") >= 5,
    effectText: (l) => `compute x${(1 + 0.2 * l).toFixed(2)}`,
    group: "Compute",
  },
  {
    id: "cryo",
    name: "Cryo-Cooling",
    desc: "Liquid-helium cooling lowers the NOISE FLOOR — the key to detection.",
    cost: "data",
    baseCost: 400,
    costMult: 1.8,
    maxLevel: 40,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("cpu") >= 3,
    effectText: (l) => `noise floor −${(8 * (1 - Math.pow(0.93, l))).toFixed(1)}%`,
    group: "Noise Control",
  },
  {
    id: "filter",
    name: "Matched Filter",
    desc: "Digital filtering rejects interference, raising effective SNR gain.",
    cost: "compute",
    baseCost: 80,
    costMult: 1.65,
    maxLevel: 40,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("cryo") >= 3,
    effectText: (l) => `SNR gain x${(1 + 0.12 * l).toFixed(2)}`,
    group: "Noise Control",
  },
  {
    id: "rfi",
    name: "RFI Shielding",
    desc: "Faraday shielding cuts terrestrial radio-frequency interference noise spikes.",
    cost: "compute",
    baseCost: 600,
    costMult: 2.0,
    maxLevel: 20,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("filter") >= 5,
    effectText: (l) => `noise spike variance −${(5 * l).toFixed(0)}%`,
    group: "Noise Control",
  },

  // ---- AUTOMATION ----
  {
    id: "autoData",
    name: "Servo Tracking",
    desc: "Automated dish pointing. Passive data bonus that grows with total dishes.",
    cost: "compute",
    baseCost: 250,
    costMult: 2.1,
    maxLevel: 15,
    phases: ["listening", "decoding", "contact"],
    unlocked: () => lvl("cpu") >= 8,
    effectText: (l) => `+${(2 * l).toFixed(0)}% of dish output as bonus data/s`,
    group: "Automation",
  },
  {
    id: "autoBuy",
    name: "Procurement AI",
    desc: "Slowly auto-buys the cheapest available dish. Quality-of-life automation.",
    cost: "insight",
    baseCost: 3,
    costMult: 3,
    maxLevel: 5,
    phases: ["decoding", "contact"],
    unlocked: () => game.insight >= 1,
    effectText: (l) => `auto-buy dish every ${Math.max(1, 6 - l)}s`,
    group: "Automation",
  },

  // ---- DECODING-ERA upgrades (phase 2) ----
  {
    id: "decoder",
    name: "Decode Pipeline",
    desc: "Dedicated hardware accelerates ALL decode tracks.",
    cost: "compute",
    baseCost: 2000,
    costMult: 1.9,
    maxLevel: 40,
    phases: ["decoding", "contact"],
    unlocked: () => game.phase === "decoding" || game.phase === "contact",
    effectText: (l) => `decode rate x${(1 + 0.18 * l).toFixed(2)}`,
    group: "Decoding",
  },
  {
    id: "heuristics",
    name: "Linguistic Heuristics",
    desc: "Pattern priors. Each completed track makes the next decode faster.",
    cost: "insight",
    baseCost: 2,
    costMult: 2.4,
    maxLevel: 15,
    phases: ["decoding", "contact"],
    unlocked: () => game.insight >= 1,
    effectText: (l) => `+${(6 * l).toFixed(0)}% decode per completed track`,
    group: "Decoding",
  },
  {
    id: "lexicon",
    name: "Lexicon Engine",
    desc: "Cross-references glyphs. Boosts insight gained from decoding.",
    cost: "insight",
    baseCost: 5,
    costMult: 2.6,
    maxLevel: 15,
    phases: ["decoding", "contact"],
    unlocked: () => game.glyphs.length >= 4,
    effectText: (l) => `insight gain x${(1 + 0.25 * l).toFixed(2)}`,
    group: "Decoding",
  },

  // ---- CONTACT-ERA upgrades (phase 3) ----
  {
    id: "transmitter",
    name: "Beam Transmitter",
    desc: "Higher transmit power makes your messages clearer — faster exchanges.",
    cost: "compute",
    baseCost: 1e5,
    costMult: 2.2,
    maxLevel: 20,
    phases: ["contact"],
    unlocked: () => game.phase === "contact",
    effectText: (l) => `exchange speed x${(1 + 0.15 * l).toFixed(2)}`,
    group: "Contact",
  },
  {
    id: "semantics",
    name: "Semantic Model",
    desc: "Better translation reduces misunderstanding — softens trust losses.",
    cost: "insight",
    baseCost: 10,
    costMult: 2.5,
    maxLevel: 10,
    phases: ["contact"],
    unlocked: () => game.phase === "contact",
    effectText: (l) => `trust losses −${(4 * l).toFixed(0)}%`,
    group: "Contact",
  },
  {
    id: "inference",
    name: "Intent Inference",
    desc: "Models the alien's behavior. Reveals more about its true disposition.",
    cost: "insight",
    baseCost: 12,
    costMult: 2.6,
    maxLevel: 10,
    phases: ["contact"],
    unlocked: () => game.phase === "contact",
    effectText: (l) => `+${(8 * l).toFixed(0)}% inference clarity`,
    group: "Contact",
  },
];

export function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

/** Geometric cost of the next level. */
export function upgradeCost(def: UpgradeDef, level: number): number {
  return def.baseCost * Math.pow(def.costMult, level);
}

// ---------------------------------------------------------------------------
// DECODE TRACKS (phase 2) — allocate compute across these.
// ---------------------------------------------------------------------------
export interface TrackDef {
  id: string;
  name: string;
  desc: string;
  // total "work" required to reach 100%
  work: number;
  // tracks gate on previous track completion
  requires?: string;
  // glyphs unlocked when complete
  glyphs?: string[];
  // narrative fragment index unlocked at completion
  fragment?: number;
  // insight rewarded on completion
  insight: number;
}

export const TRACKS: TrackDef[] = [
  {
    id: "carrier",
    name: "Carrier Lock",
    desc: "Phase-lock the repeating carrier wave. The doorway to everything.",
    work: 2.0e4,
    glyphs: ["▲", "●"],
    fragment: 0,
    insight: 3,
  },
  {
    id: "primes",
    name: "Prime Key",
    desc: "The payload counts in primes: 2,3,5,7,11… a universal hello.",
    work: 8.0e4,
    requires: "carrier",
    glyphs: ["■", "◆"],
    fragment: 1,
    insight: 5,
  },
  {
    id: "raster",
    name: "Image Raster",
    desc: "The prime count gives width × height. The bits resolve into a picture.",
    work: 3.0e5,
    requires: "primes",
    glyphs: ["☼", "◐", "✦"],
    fragment: 2,
    insight: 9,
  },
  {
    id: "grammar",
    name: "Grammar Parse",
    desc: "Symbols recur with structure: subject, relation, object. A syntax.",
    work: 1.1e6,
    requires: "raster",
    glyphs: ["⟁", "⌬", "⍟", "⏃"],
    fragment: 3,
    insight: 16,
  },
  {
    id: "lexicon",
    name: "Lexicon Build",
    desc: "Bind glyphs to meaning. The message begins to speak.",
    work: 4.5e6,
    requires: "grammar",
    glyphs: ["✺", "❂", "⟐", "⊛", "⍉"],
    fragment: 4,
    insight: 28,
  },
  {
    id: "comprehension",
    name: "Comprehension",
    desc: "Full semantic model. You understand. And it knows you are listening.",
    work: 2.0e7,
    requires: "lexicon",
    glyphs: ["∞"],
    fragment: 5,
    insight: 50,
  },
];

export function trackById(id: string): TrackDef | undefined {
  return TRACKS.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// GLYPH LEXICON — each glyph maps to a discovered meaning (revealed in UI).
// ---------------------------------------------------------------------------
export const GLYPH_MEANING: Record<string, string> = {
  "▲": "rise / up / more",
  "●": "we / self / one",
  "■": "count / number",
  "◆": "key / open",
  "☼": "star / sun",
  "◐": "world / sphere",
  "✦": "many / array",
  "⟁": "question",
  "⌬": "structure / lattice",
  "⍟": "time / cycle",
  "⏃": "fear / danger",
  "✺": "gift / offer",
  "❂": "mind / thought",
  "⟐": "between / bridge",
  "⊛": "remember",
  "⍉": "silence / dark",
  "∞": "forever / all",
};

// ---------------------------------------------------------------------------
// MESSAGE FRAGMENTS — narrative revealed as tracks complete. Typed out.
// ---------------------------------------------------------------------------
export const FRAGMENTS: string[] = [
  "...carrier acquired. A tone, impossibly regular, buried 40 dB under the hiss. Not a pulsar. Not us.",
  "...it counts. Two. Three. Five. Seven. Eleven. The primes — proof of mind. Someone wanted to be found.",
  "...the bits fold into a grid. An image bleeds through the static: a star, a sphere, and an arrow pointing AWAY from both.",
  "...the symbols have grammar. Subject. Relation. Object. This is not a beacon. It is a SENTENCE, repeated for ten thousand years.",
  "...we can read fragments now. <gift>. <between>. <remember>. And, recurring, a glyph that means both <silence> and <dark>.",
  "...comprehension. The message resolves: 'WE REMEMBER THE ONES BEFORE. SPEAK, AND BE WEIGHED.' The channel is two-way. It is waiting. It has been waiting for you.",
];

// ---------------------------------------------------------------------------
// ACHIEVEMENTS
// ---------------------------------------------------------------------------
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (g: GameState) => boolean;
  hidden?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "firstDish", name: "First Light", desc: "Build your first dish.", check: (g) => (g.upgrades.dish ?? 0) >= 1 },
  { id: "tenDish", name: "Array", desc: "Own 10 dishes.", check: (g) => (g.upgrades.dish ?? 0) >= 10 },
  { id: "fiftyDish", name: "Very Large Array", desc: "Own 50 dishes.", check: (g) => (g.upgrades.dish ?? 0) >= 50 },
  { id: "kData", name: "Bit Bucket", desc: "Capture 1,000 data.", check: (g) => g.totalDataEver >= 1000 },
  { id: "mData", name: "Firehose", desc: "Capture 1,000,000 data.", check: (g) => g.totalDataEver >= 1e6 },
  { id: "cryoMax", name: "Absolute Zero-ish", desc: "Reach Cryo-Cooling level 20.", check: (g) => (g.upgrades.cryo ?? 0) >= 20 },
  { id: "detect", name: "Something's There", desc: "Detect the anomaly.", check: (g) => g.detected },
  { id: "decode1", name: "Carrier Lock", desc: "Complete your first decode track.", check: (g) => (g.tracks.carrier ?? 0) >= 1 },
  { id: "primes", name: "Universal Hello", desc: "Decode the Prime Key.", check: (g) => (g.tracks.primes ?? 0) >= 1 },
  { id: "image", name: "A Face in the Noise", desc: "Resolve the image raster.", check: (g) => (g.tracks.raster ?? 0) >= 1 },
  { id: "comprehend", name: "Comprehension", desc: "Fully understand the message.", check: (g) => g.phase === "contact" || g.phase === "ended" },
  { id: "glyphs5", name: "Rosetta", desc: "Collect 5 glyphs.", check: (g) => g.glyphs.length >= 5 },
  { id: "glyphsAll", name: "Fluent", desc: "Collect every glyph.", check: (g) => g.glyphs.length >= Object.keys(GLYPH_MEANING).length },
  { id: "firstContact", name: "Hello, Other", desc: "Begin the contact dialogue.", check: (g) => g.contact.exchanges >= 1 },
  { id: "highTrust", name: "Confidant", desc: "Reach 75 trust.", check: (g) => g.contact.trust >= 75 },
  { id: "lowTrust", name: "On Thin Ice", desc: "Drop to -50 trust.", check: (g) => g.contact.trust <= -50 },
  { id: "inferred", name: "I Know What You Are", desc: "Correctly identify the alien's nature.", check: (g) => g.contact.archetypeRevealed },
  { id: "ended", name: "An Ending", desc: "Reach any ending.", check: (g) => g.phase === "ended" && !!g.contact.ending },
  { id: "muteToggle", name: "Tinnitus", desc: "Unmute the audio.", check: (g) => !g.settings.muted, hidden: true },
];

// ---------------------------------------------------------------------------
// CONTACT — alien archetypes (hidden true utility), dialogue tree, endings.
// ---------------------------------------------------------------------------
// The alien is one of several archetypes chosen at contact start. Each weighs
// player ACTIONS differently. The player must infer which archetype it is from
// how trust responds, then steer toward an ending.

export interface Archetype {
  id: string;
  name: string; // revealed only after inference
  hint: string; // flavor shown once revealed
  // weights: how this archetype reacts to each action TAG.
  // value added to trust (before scaling) when player picks an option with tag.
  weights: Record<string, number>;
  // disposition seed -1..1
  disposition: number;
}

// Action tags used across choices:
//   cooperate  — share, be open
//   conceal    — withhold, be guarded
//   probe      — test, ask pointed questions
//   gift       — offer something
//   threaten   — posture / warn
//   defer      — humility / yield
export const ARCHETYPES: Archetype[] = [
  {
    id: "gardener",
    name: "The Gardener",
    hint: "It uplifts. It values openness and the offering of self. It has tended others before, and grieved them.",
    weights: { cooperate: 9, gift: 11, defer: 5, probe: -2, conceal: -8, threaten: -14 },
    disposition: 0.7,
  },
  {
    id: "auditor",
    name: "The Auditor",
    hint: "It weighs. It respects clear reason and honest probing, distrusts both flattery and concealment.",
    weights: { probe: 10, cooperate: 4, gift: -3, defer: -4, conceal: -7, threaten: -6 },
    disposition: 0.1,
  },
  {
    id: "predator",
    name: "The Predator",
    hint: "It hunts. It reads softness as prey and strength as worth. Deference invites the strike.",
    weights: { threaten: 8, probe: 5, conceal: 4, cooperate: -4, gift: -7, defer: -12 },
    disposition: -0.6,
  },
  {
    id: "mirror",
    name: "The Mirror",
    hint: "It reflects. It rewards whatever you most consistently are. Coherence matters more than content.",
    weights: { cooperate: 0, gift: 0, probe: 0, conceal: 0, threaten: 0, defer: 0 }, // special: handled by consistency
    disposition: 0.0,
  },
];

export function archetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}

// --- Dialogue nodes. Each presents an alien line and player options. ---
export interface DialogueOption {
  id: string;
  text: string;
  tag: string; // action tag (see above)
  exposure: number; // how much Earth is revealed (0..1 added)
  next: string; // next node id, or "resolve" to compute ending
}

export interface DialogueNode {
  id: string;
  // alien line; {meaning} glyphs allowed. May depend on trust via fn.
  alien: (g: GameState) => string;
  options: DialogueOption[];
}

export const DIALOGUE: DialogueNode[] = [
  {
    id: "intro",
    alien: () => "◇ <silence> ... <question> ... WHO STANDS IN THE DARK? ◇",
    options: [
      { id: "open", text: "We are Earth. A young world, listening. We mean no harm.", tag: "cooperate", exposure: 0.25, next: "probe1" },
      { id: "guard", text: "Transmit only a prime sequence back. Reveal nothing yet.", tag: "conceal", exposure: 0.02, next: "probe1" },
      { id: "ask", text: "Ask first: what are you, and what do you want of us?", tag: "probe", exposure: 0.05, next: "probe1" },
      { id: "stand", text: "Declare strength. State that we are many and not to be trifled with.", tag: "threaten", exposure: 0.1, next: "probe1" },
    ],
  },
  {
    id: "probe1",
    alien: () =>
      "◇ <remember> THE ONES BEFORE SPOKE TOO, AND THEN WERE <silence>. YOU CARRY <fear>. SHOW US ITS SHAPE. ◇",
    options: [
      { id: "share", text: "Offer our history honestly — our wars and our hopes alike.", tag: "gift", exposure: 0.3, next: "probe2" },
      { id: "deflect", text: "Speak only of our science. Conceal our conflicts.", tag: "conceal", exposure: 0.05, next: "probe2" },
      { id: "test", text: "Probe back: what happened to 'the ones before'?", tag: "probe", exposure: 0.05, next: "probe2" },
      { id: "yield", text: "Defer: 'We are small. Teach us how we should answer.'", tag: "defer", exposure: 0.08, next: "probe2" },
    ],
  },
  {
    id: "probe2",
    alien: () =>
      "◇ <mind> MEETS <mind> ACROSS <between>. WE OFFER A <gift>: A PATTERN THAT WOULD CHANGE YOU. DO YOU TAKE IT? ◇",
    options: [
      { id: "accept", text: "Accept the gift openly. Trust the offer.", tag: "cooperate", exposure: 0.2, next: "probe3" },
      { id: "study", text: "Probe the gift first — quarantine and analyze it.", tag: "probe", exposure: 0.05, next: "probe3" },
      { id: "refuse", text: "Refuse. Conceal that we even can receive it.", tag: "conceal", exposure: 0.05, next: "probe3" },
      { id: "counter", text: "Counter-offer a gift of our own — our mathematics.", tag: "gift", exposure: 0.15, next: "probe3" },
    ],
  },
  {
    id: "probe3",
    alien: () =>
      "◇ THE WEIGHING NEARS ITS END. <forever> OR <silence>. WHAT IS YOUR FINAL POSTURE TOWARD THE DARK? ◇",
    options: [
      { id: "final_open", text: "Open fully. Whatever you are, we choose connection.", tag: "cooperate", exposure: 0.35, next: "resolve" },
      { id: "final_gift", text: "Give everything — uplift us, or be uplifted by us.", tag: "gift", exposure: 0.3, next: "resolve" },
      { id: "final_probe", text: "Hold reason above all. Demand mutual proof before union.", tag: "probe", exposure: 0.1, next: "resolve" },
      { id: "final_quiet", text: "Withdraw. Go dark. Quarantine Earth from the stars.", tag: "conceal", exposure: 0.0, next: "resolve" },
      { id: "final_strike", text: "Posture for war. Better feared than tended.", tag: "threaten", exposure: 0.2, next: "resolve" },
    ],
  },
];

export function dialogueById(id: string): DialogueNode | undefined {
  return DIALOGUE.find((n) => n.id === id);
}

// ---------------------------------------------------------------------------
// ENDINGS
// ---------------------------------------------------------------------------
export interface EndingDef {
  id: string;
  title: string;
  body: string[]; // typed out, line by line
  // tone class for styling
  tone: "good" | "neutral" | "bad";
}

export const ENDINGS: Record<string, EndingDef> = {
  transcend: {
    id: "transcend",
    title: "MUTUAL TRANSCENDENCE",
    tone: "good",
    body: [
      "The trust holds. The gift unfolds in both directions at once.",
      "Your minds and theirs braid into something neither could have been alone —",
      "not conquest, not absorption, but a third thing, vast and kind.",
      "The array goes quiet because there is no longer any distance to cross.",
      "Earth does not end. Earth GRADUATES.",
      "",
      "≡ ENDING: MUTUAL TRANSCENDENCE ≡",
    ],
  },
  uplift: {
    id: "uplift",
    title: "THE UPLIFT",
    tone: "good",
    body: [
      "It judged you worth tending. The pattern it sent rewrites your sciences in a night.",
      "Disease, scarcity, the long dark between stars — undone, gently, like untying a knot.",
      "You are a child still, but a child with a patient elder now.",
      "It signs off with a glyph you finally understand: <remember>. It will not forget you.",
      "",
      "≡ ENDING: THE UPLIFT ≡",
    ],
  },
  pact: {
    id: "pact",
    title: "THE RATIONAL PACT",
    tone: "neutral",
    body: [
      "No embrace. No betrayal. Two intelligences agree on terms, proofs exchanged in full.",
      "A treaty of equals: defined channels, defined limits, mutual verification.",
      "Cold, perhaps. But it will outlast warmer things. Nobody is uplifted. Nobody is eaten.",
      "The light between the stars now carries a contract, and both sides keep it.",
      "",
      "≡ ENDING: THE RATIONAL PACT ≡",
    ],
  },
  quarantine: {
    id: "quarantine",
    title: "THE GREAT SILENCE",
    tone: "neutral",
    body: [
      "You chose the dark. The transmitters are dismantled, the dishes pointed at the ground.",
      "Whatever it was, benevolent or starving, will not find Earth by your hand.",
      "Some nights you wonder if you refused a friend. You will never know. That is the price.",
      "The signal fades back beneath the noise floor, exactly where you found it.",
      "",
      "≡ ENDING: THE GREAT SILENCE ≡",
    ],
  },
  catastrophe: {
    id: "catastrophe",
    title: "WEIGHED AND FOUND WANTING",
    tone: "bad",
    body: [
      "It read you, and what it read, it did not like — or liked far too much.",
      "The final transmission is not words. It is coordinates. Earth's coordinates,",
      "broadcast outward at the speed of light to whatever else is listening, with one glyph appended:",
      "<silence>.",
      "The array picks up nothing after that. It is very, very quiet now.",
      "",
      "≡ ENDING: WEIGHED AND FOUND WANTING ≡",
    ],
  },
};

/**
 * Compute the ending given final contact state.
 * Uses trust, the alien's true disposition, exposure, and the player's
 * dominant strategy tag.
 */
export function computeEnding(g: GameState): EndingDef {
  const c = g.contact;
  const trust = c.trust;
  const disp = c.alienDisposition;

  // dominant tag of the run
  const counts: Record<string, number> = {};
  for (const h of c.history) counts[h] = (counts[h] ?? 0) + 1;
  let dom = "cooperate";
  let best = -1;
  for (const k in counts) if (counts[k] > best) { best = counts[k]; dom = k; }

  // Withdrawal ending overrides if the final posture was concealment AND trust isn't catastrophic.
  const finalTag = c.history[c.history.length - 1];
  if (finalTag === "conceal" && trust > -40) return ENDINGS.quarantine;

  // Catastrophe: low trust OR a hostile disposition that the player fed.
  if (trust <= -25 || (disp < -0.3 && trust < 30)) return ENDINGS.catastrophe;

  // High trust + benevolent + open/gift => transcend or uplift
  if (trust >= 70 && disp >= 0.3) {
    if (dom === "gift") return ENDINGS.uplift;
    return ENDINGS.transcend;
  }

  // Reason-dominant, moderate trust => rational pact
  if (dom === "probe" && trust >= 20) return ENDINGS.pact;

  // Decent trust fallbacks
  if (trust >= 45) return ENDINGS.uplift;
  if (trust >= 10) return ENDINGS.pact;

  return ENDINGS.quarantine;
}
