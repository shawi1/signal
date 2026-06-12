// waterfall.ts — scrolling spectrogram. Each frame we push a new column of
// "frequency bins"; an anomaly line brightens and narrows as SNR rises and the
// signal is detected. Classic SETI waterfall look.

import { game } from "../modules/state";
import { computeDerived } from "../modules/loop";

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let phase = 0;

export function initWaterfall(el: HTMLCanvasElement): void {
  canvas = el;
  ctx = canvas.getContext("2d")!;
  resize();
  window.addEventListener("resize", resize);
}

function resize(): void {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(200, Math.floor(r.width));
  canvas.height = Math.max(60, Math.floor(r.height));
}

function color(theme: string, v: number): string {
  // v 0..1 intensity
  v = Math.max(0, Math.min(1, v));
  if (theme === "amber") {
    const r = 40 + v * 215;
    const g = 20 + v * 170;
    const b = v * 60;
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  // phosphor: dark teal -> bright green
  const r = v * 140;
  const g = 20 + v * 235;
  const b = 30 + v * 120;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function drawWaterfall(): void {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;
  phase += 0.08;

  // scroll existing image up by 1px
  const img = ctx.getImageData(0, 1, w, h - 1);
  ctx.putImageData(img, 0, 0);

  const d = computeDerived();
  const noise = Math.min(1, d.noiseFloor / 100);
  const snrFrac = Math.min(1, game.snr / 80);
  const theme = game.settings.theme;

  // anomaly sits at a fixed bin; gets brighter & sharper as SNR climbs.
  const anomalyBin = 0.5 + 0.18 * Math.sin(phase * 0.05);
  const anomalyStrength = game.detected ? 1 : snrFrac;
  const anomalyWidth = 0.06 - anomalyStrength * 0.045; // narrows

  // draw the new bottom row
  for (let x = 0; x < w; x++) {
    const f = x / w;
    let v = noise * (0.25 + 0.55 * Math.random()); // background hiss

    // the buried anomaly band
    const dist = Math.abs(f - anomalyBin);
    if (dist < anomalyWidth) {
      const within = 1 - dist / anomalyWidth;
      v += anomalyStrength * within * (0.5 + 0.5 * Math.sin(phase * 6 + f * 30));
    }

    // contact phase: a second band carrying trust
    if (game.phase === "contact" || game.phase === "ended") {
      const tb = 0.25 + (game.contact.trust + 100) / 200 * 0.5;
      const dd = Math.abs(f - tb);
      if (dd < 0.02) v += 0.8 * (1 - dd / 0.02);
    }

    ctx.fillStyle = color(theme, v);
    ctx.fillRect(x, h - 1, 1, 1);
  }
}
