// format.ts — number & time formatting up to 1e300+
// Uses scientific suffixes for the readable range, then falls back to
// mantissa-exponent scientific notation.

const SUFFIXES = [
  "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
  "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc",
  "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OcVg", "NoVg",
  "Tg",
];

/** Format a number for display. Handles 0..1e300+ and small fractions. */
export function fmt(n: number, decimals = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "0";
  if (!Number.isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n, decimals);
  if (n === 0) return "0";

  if (n < 1) {
    // small fractions: show a couple of sig figs
    if (n < 0.0001) return n.toExponential(2).replace("e", "e");
    return trimZeros(n.toPrecision(2));
  }

  if (n < 1000) {
    // whole-ish small numbers
    if (n < 10) return trimZeros(n.toFixed(Math.min(decimals, 2)));
    if (n < 100) return trimZeros(n.toFixed(Math.min(decimals, 1)));
    return Math.floor(n).toString();
  }

  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = n / Math.pow(1000, tier);
    return trimZeros(scaled.toFixed(decimals)) + SUFFIXES[tier];
  }

  // scientific fallback
  const exp = Math.floor(Math.log10(n));
  const mantissa = n / Math.pow(10, exp);
  return `${trimZeros(mantissa.toFixed(3))}e${exp}`;
}

/** Compact integer formatting (no decimals for counts). */
export function fmtInt(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  return fmt(n, 2);
}

/** Format a per-second rate. */
export function fmtRate(n: number): string {
  return fmt(n, 2) + "/s";
}

/** Format a 0..1 value as a percentage. */
export function fmtPct(frac: number, decimals = 1): string {
  return (frac * 100).toFixed(decimals) + "%";
}

/** Format seconds as a human duration. */
export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "∞";
  seconds = Math.max(0, Math.floor(seconds));
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return `${h}h ${mm}m`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d}d ${hh}h`;
}

/** A 7-seg friendly fixed-width number (pads decimals). */
export function fmtSeg(n: number): string {
  return fmt(n, 2);
}

function trimZeros(s: string): string {
  if (s.indexOf(".") === -1) return s;
  return s.replace(/\.?0+$/, "");
}
