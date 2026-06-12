// audio.ts — generated WebAudio. No asset files. Static hiss, tuning beeps,
// a Geiger-ish detection tick, and signal tones. Respects the mute setting.

import { game } from "./state";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let hissNode: AudioBufferSourceNode | null = null;
let hissGain: GainNode | null = null;
let started = false;

function ensureCtx(): AudioContext | null {
  if (game.settings.muted) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.25;
      masterGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** White-noise buffer for the static hiss bed. */
function makeNoiseBuffer(c: AudioContext): AudioBuffer {
  const len = c.sampleRate * 2;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Start the continuous static hiss bed (called on first user gesture). */
export function startAmbient(): void {
  const c = ensureCtx();
  if (!c || started) return;
  started = true;
  const buf = makeNoiseBuffer(c);
  hissNode = c.createBufferSource();
  hissNode.buffer = buf;
  hissNode.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  hissGain = c.createGain();
  hissGain.gain.value = 0.06;
  hissNode.connect(lp).connect(hissGain).connect(masterGain!);
  hissNode.start();
}

/** Set hiss volume relative to noise floor / phase (0..1 intensity). */
export function setHissIntensity(intensity: number): void {
  if (!hissGain || !ctx) return;
  const target = 0.02 + 0.09 * Math.max(0, Math.min(1, intensity));
  hissGain.gain.setTargetAtTime(target, ctx.currentTime, 0.5);
}

function blip(freq: number, dur: number, type: OscillatorType, vol = 0.3): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = 0;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  osc.connect(g).connect(masterGain);
  osc.start();
  osc.stop(c.currentTime + dur + 0.02);
}

/** A soft UI tuning beep (buying, toggles). */
export function beep(): void {
  blip(660, 0.08, "square", 0.18);
}

/** A higher confirm chirp. */
export function chirp(): void {
  blip(880, 0.06, "triangle", 0.2);
  setTimeout(() => blip(1320, 0.08, "triangle", 0.16), 60);
}

/** A negative / error buzz. */
export function buzz(): void {
  blip(160, 0.16, "sawtooth", 0.18);
}

/** Geiger-ish detection tick — used as anomaly nears confirmation. */
export function tick(strength = 1): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  // short noise burst
  const buf = c.createBuffer(1, c.sampleRate * 0.03, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 0.12 * strength;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  src.connect(bp).connect(g).connect(masterGain);
  src.start();
}

/** A pure signal tone — used on detection & big events. */
export function signalTone(freq = 440, dur = 0.6): void {
  blip(freq, dur, "sine", 0.22);
}

/** Detection fanfare: a rising sweep landing on a clean tone. */
export function detectionStinger(): void {
  const c = ensureCtx();
  if (!c || !masterGain) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.5);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.linearRampToValueAtTime(0.25, c.currentTime + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.2);
  osc.connect(g).connect(masterGain);
  osc.start();
  osc.stop(c.currentTime + 1.3);
}

/** Toggle mute: stop/resume context. */
export function applyMute(): void {
  if (game.settings.muted) {
    if (ctx) void ctx.suspend();
  } else {
    const c = ensureCtx();
    if (c && !started) startAmbient();
    if (c && c.state === "suspended") void c.resume();
  }
}
