// scope.ts — animated phosphor oscilloscope. Draws a live waveform whose
// character reflects game state: SNR raises a coherent buried tone above the
// noise; detection/contact morph the trace.

import { game } from "../modules/state";
import { computeDerived } from "../modules/loop";

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let t = 0;

// phosphor persistence buffer drawn as a fading trail
export function initScope(el: HTMLCanvasElement): void {
  canvas = el;
  ctx = canvas.getContext("2d")!;
  resize();
  window.addEventListener("resize", resize);
}

function resize(): void {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(200, Math.floor(r.width));
  canvas.height = Math.max(80, Math.floor(r.height));
}

function themeColor(): string {
  const s = getComputedStyle(document.documentElement);
  return s.getPropertyValue("--fg").trim() || "#6dffa0";
}

export function drawScope(): void {
  if (!ctx || !canvas) return;
  const w = canvas.width;
  const h = canvas.height;
  t += 0.05;

  const d = computeDerived();
  const fg = themeColor();

  // fade previous frame (phosphor persistence)
  ctx.fillStyle = "rgba(2,5,3,0.28)";
  ctx.fillRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = "rgba(80,255,150,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= w; gx += w / 10) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
  for (let gy = 0; gy <= h; gy += h / 4) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
  ctx.stroke();
  // center line
  ctx.strokeStyle = "rgba(80,255,150,0.15)";
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

  // signal characteristics
  const noise = Math.min(1, d.noiseFloor / 100); // 0..1, lower = cleaner
  const snrFrac = Math.min(1, game.snr / 80);
  const coherent = game.detected ? 1 : Math.min(1, snrFrac * 1.3);
  const amp = h * 0.34;

  // In contact phase, the trace carries the alien's "mood" (trust).
  let carrierFreq = 6 + snrFrac * 10;
  let trustMod = 0;
  if (game.phase === "contact" || game.phase === "ended") {
    const tr = game.contact.trust / 100;
    trustMod = tr;
    carrierFreq = 8 + tr * 6;
  }

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = fg;
  ctx.shadowColor = fg;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let x = 0; x <= w; x++) {
    const px = x / w;
    // buried coherent carrier (emerges with SNR)
    const carrier = Math.sin(px * carrierFreq * Math.PI * 2 + t) * coherent;
    // a second harmonic appears once decoding/contact
    const harm = (game.phase === "listening" ? 0 : 0.35)
      * Math.sin(px * carrierFreq * 2 * Math.PI * 2 - t * 1.3) * coherent;
    // hiss
    const hiss = (Math.random() * 2 - 1) * noise * (1 - coherent * 0.6);
    // trust wobble in contact
    const wob = trustMod * 0.15 * Math.sin(px * 3 * Math.PI * 2 + t * 0.7);
    const y = h / 2 - (carrier + harm + hiss + wob) * amp;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // sweep highlight
  const sweepX = (t * 40) % w;
  const grad = ctx.createLinearGradient(sweepX - 30, 0, sweepX, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(140,255,190,0.12)");
  ctx.fillStyle = grad;
  ctx.fillRect(sweepX - 30, 0, 30, h);
}
