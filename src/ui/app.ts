// app.ts — builds the terminal UI and updates it each animation frame.
// Reads engine APIs (loop/content/state/format/save/audio); never duplicates
// game logic — only presents it and routes user input back into the engine.

import * as audio from "../modules/audio";
import {
  ACHIEVEMENTS,
  ARCHETYPES,
  ENDINGS,
  FRAGMENTS,
  GLYPH_MEANING,
  TRACKS,
  UPGRADES,
  dialogueById,
  type DialogueOption,
  type UpgradeDef,
} from "../modules/content";
import {
  affordable,
  bulkCost,
  buyMode,
  chooseDialogue,
  computeDerived,
  drainEvents,
  setAlloc,
} from "../modules/loop";
import { fmt, fmtPct, fmtRate, fmtTime } from "../modules/format";
import { exportSave, hardReset, importSave, saveNow } from "../modules/save";
import { game } from "../modules/state";
import { initScope, drawScope } from "./scope";
import { initWaterfall, drawWaterfall } from "./waterfall";
import { Typer } from "./typer";

const $ = (s: string, r: ParentNode = document): HTMLElement => r.querySelector(s) as HTMLElement;
function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const COST_LABEL: Record<string, string> = { data: "DATA", compute: "COMPUTE", insight: "INSIGHT" };

// ---- module state ----
let root: HTMLElement;
let fragTyper: Typer;
let alienTyper: Typer;
let lastFragShown = -1;
let lastNode = "";
let endingTyped = false;

// ---------------------------------------------------------------------------
// BUILD — static skeleton; dynamic content is filled by update().
// ---------------------------------------------------------------------------
export function buildUI(): void {
  root = $("#app");
  applyTheme();
  root.innerHTML = `
    <div id="topbar">
      <span class="title glow">SIGNAL</span>
      <span class="phase-pill" id="phase-pill">LISTENING</span>
      <span class="spacer"></span>
      <span class="buymode" id="buymode"></span>
      <button id="btn-theme" data-tip="Toggle phosphor / amber">THEME</button>
      <button id="btn-mute" data-tip="Toggle audio">AUDIO</button>
      <button id="btn-crt" data-tip="Toggle CRT effects">CRT</button>
      <button id="btn-settings">SYS</button>
    </div>
    <div class="grid-main">
      <div class="col-left">
        <div class="panel">
          <div class="panel-title"><span>RECEIVER // OSCILLOSCOPE</span><span id="scope-state" class="dim"></span></div>
          <canvas id="scope-canvas"></canvas>
          <canvas id="fall-canvas"></canvas>
        </div>
        <div class="panel" id="meters-panel">
          <div class="panel-title"><span>INSTRUMENTATION</span></div>
          <div id="meters"></div>
        </div>
        <div class="panel" id="phase-panel">
          <div class="panel-title"><span id="phase-panel-title">SIGNAL LOG</span></div>
          <div id="phase-body"></div>
        </div>
      </div>
      <div class="col-right">
        <div class="panel">
          <div class="panel-title"><span>RESOURCES</span></div>
          <div class="readout" id="readout"></div>
        </div>
        <div class="panel" id="upgrades-panel">
          <div class="panel-title"><span>CONSOLE // UPGRADES</span></div>
          <div class="upgrade-groups" id="upgrades"></div>
        </div>
        <div class="panel">
          <div class="panel-title"><span>ACHIEVEMENTS</span><span class="dim" id="ach-count"></span></div>
          <div class="ach-list" id="achievements"></div>
        </div>
      </div>
    </div>
    <div id="toasts"></div>
    <div id="modal-bg"><div class="modal" id="modal"></div></div>
  `;

  initScope($("#scope-canvas") as HTMLCanvasElement);
  initWaterfall($("#fall-canvas") as HTMLCanvasElement);
  fragTyper = new Typer($("#phase-body"));
  alienTyper = new Typer(document.createElement("div"));

  buildBuyMode();
  buildAchievements();
  wireTopbar();
}

function wireTopbar(): void {
  $("#btn-theme").onclick = () => {
    game.settings.theme = game.settings.theme === "phosphor" ? "amber" : "phosphor";
    applyTheme(); audio.beep();
  };
  $("#btn-mute").onclick = () => {
    game.settings.muted = !game.settings.muted;
    audio.applyMute();
    if (!game.settings.muted) audio.beep();
    updateTopbarButtons();
  };
  $("#btn-crt").onclick = () => {
    game.settings.crtEffects = !game.settings.crtEffects;
    document.body.classList.toggle("no-crt", !game.settings.crtEffects);
    audio.beep();
    updateTopbarButtons();
  };
  $("#btn-settings").onclick = openSettings;
  document.body.classList.toggle("no-crt", !game.settings.crtEffects);
  updateTopbarButtons();
}

function updateTopbarButtons(): void {
  ($("#btn-mute") as HTMLButtonElement).classList.toggle("sel", !game.settings.muted);
  $("#btn-mute").textContent = game.settings.muted ? "AUDIO ✕" : "AUDIO ◉";
  $("#btn-crt").classList.toggle("sel", game.settings.crtEffects);
}

function applyTheme(): void {
  document.documentElement.setAttribute("data-theme", game.settings.theme);
}

function buildBuyMode(): void {
  const host = $("#buymode");
  host.innerHTML = "";
  host.appendChild(el("span", "dim", "BUY "));
  const modes: (1 | 10 | 100 | "max")[] = [1, 10, 100, "max"];
  for (const m of modes) {
    const b = el("button") as HTMLButtonElement;
    b.textContent = m === "max" ? "MAX" : "x" + m;
    b.onclick = () => { game.settings.buyMode = m; buildBuyMode(); audio.beep(); };
    if (game.settings.buyMode === m) b.classList.add("sel");
    host.appendChild(b);
  }
}

// ---------------------------------------------------------------------------
// PER-FRAME UPDATE
// ---------------------------------------------------------------------------
let lastPhase = "";
export function update(): void {
  drawScope();
  drawWaterfall();
  flushEvents();

  const d = computeDerived();
  updateTopbar();
  updateReadout(d);
  updateMeters(d);
  updateUpgrades();
  updateAchievements();

  if (game.phase !== lastPhase) {
    lastPhase = game.phase;
    rebuildPhasePanel();
  }
  updatePhasePanel(d);
}

function updateTopbar(): void {
  const pill = $("#phase-pill");
  const map: Record<string, string> = {
    listening: "PH.1 // LISTENING",
    decoding: "PH.2 // DECODING",
    contact: "PH.3 // CONTACT",
    ended: "TRANSMISSION ENDED",
  };
  pill.textContent = map[game.phase] ?? game.phase;
  const ss = $("#scope-state");
  if (game.phase === "listening") {
    ss.textContent = game.detected ? "LOCK" : game.snr >= 40 ? "DETECTING…" : "SCANNING";
  } else if (game.phase === "decoding") ss.textContent = "DECODING";
  else ss.textContent = "TWO-WAY";
}

function updateReadout(d: ReturnType<typeof computeDerived>): void {
  const r = $("#readout");
  const stats: string[] = [];
  stats.push(stat("DATA", fmt(game.data), fmtRate(d.dataRate)));
  stats.push(stat("COMPUTE", fmt(game.compute), fmtRate(d.computeRate)));
  if (game.phase !== "listening" || game.insight > 0)
    stats.push(stat("INSIGHT", fmt(game.insight), "decode reward"));
  stats.push(stat("SNR", fmt(game.snr, 1), "→ " + fmt(d.snrTarget, 1)));
  stats.push(stat("NOISE FLOOR", fmt(d.noiseFloor, 1), "lower = better"));
  r.innerHTML = stats.join("");
}
function stat(k: string, v: string, r: string): string {
  return `<div class="stat"><div class="k">${k}</div><div class="v mono">${v}</div><div class="r">${r}</div></div>`;
}

function updateMeters(d: ReturnType<typeof computeDerived>): void {
  const m = $("#meters");
  const rows: string[] = [];
  // SNR vs detection threshold (40)
  const snrPct = Math.min(1, game.snr / 80);
  const snrCls = game.snr >= 40 ? "" : "warn";
  rows.push(meter("SNR", snrPct, snrCls, fmt(game.snr, 1)));
  // noise floor (inverted: full bar = noisy/bad)
  rows.push(meter("NOISE", Math.min(1, d.noiseFloor / 100), "bad", fmt(d.noiseFloor, 1)));
  if (game.phase === "listening") {
    rows.push(meter("ANOMALY", game.anomalyCharge, game.anomalyCharge >= 1 ? "" : "warn",
      fmtPct(game.anomalyCharge)));
  }
  if (game.phase === "contact" || game.phase === "ended") {
    const c = game.contact;
    rows.push(meter("TRUST", (c.trust + 100) / 200, c.trust >= 0 ? "" : "bad", c.trust.toFixed(0)));
    rows.push(meter("EXPOSURE", c.exposure, c.exposure > 0.6 ? "warn" : "", fmtPct(c.exposure)));
    rows.push(meter("COMPREHENSION", c.comprehension, "", fmtPct(c.comprehension)));
  }
  m.innerHTML = rows.join("");
}
function meter(lbl: string, frac: number, cls: string, val: string): string {
  const w = Math.max(0, Math.min(100, frac * 100));
  return `<div class="meter-row"><span class="lbl">${lbl}</span>` +
    `<span class="meter ${cls}"><i style="width:${w}%"></i></span>` +
    `<span class="val mono">${val}</span></div>`;
}

// ---------------------------------------------------------------------------
// UPGRADES
// ---------------------------------------------------------------------------
function updateUpgrades(): void {
  const host = $("#upgrades");
  const visible = UPGRADES.filter((u) => u.phases.includes(game.phase));
  // group
  const groups = new Map<string, UpgradeDef[]>();
  for (const u of visible) {
    if (!groups.has(u.group)) groups.set(u.group, []);
    groups.get(u.group)!.push(u);
  }
  // build a signature to avoid full rebuild every frame; but we update buy
  // affordability inline, so just rebuild structure when set of ids changes.
  const sig = visible.map((u) => u.id + (u.unlocked(game) ? "1" : "0")).join(",");
  if (host.dataset.sig !== sig) {
    host.dataset.sig = sig;
    host.innerHTML = "";
    for (const [gname, defs] of groups) {
      const wrap = el("div", "ug-group");
      wrap.appendChild(el("div", "ug-head", "── " + gname.toUpperCase()));
      for (const def of defs) wrap.appendChild(buildUpgradeRow(def));
      host.appendChild(wrap);
    }
  }
  // refresh affordability / costs each frame
  for (const def of visible) refreshUpgradeRow(def);
}

function buildUpgradeRow(def: UpgradeDef): HTMLElement {
  const row = el("div", "upgrade");
  row.id = "ug-" + def.id;
  row.innerHTML = `
    <div><span class="u-name">${def.name}</span> <span class="u-lvl" id="lvl-${def.id}"></span></div>
    <div class="u-buy"><button id="buy-${def.id}"></button><div class="u-cost" id="cost-${def.id}"></div></div>
    <div class="u-desc">${def.desc}</div>
    <div class="u-eff" id="eff-${def.id}"></div>
    <div class="unlock-hint" id="hint-${def.id}"></div>
  `;
  ($("#buy-" + def.id, row) as HTMLButtonElement).onclick = () => {
    const res = buyMode(def.id);
    if (res.bought > 0) saveNow();
  };
  return row;
}

function refreshUpgradeRow(def: UpgradeDef): void {
  const row = document.getElementById("ug-" + def.id);
  if (!row) return;
  const unlocked = def.unlocked(game);
  row.classList.toggle("locked", !unlocked);
  const cur = game.upgrades[def.id] ?? 0;
  const maxed = def.maxLevel !== undefined && cur >= def.maxLevel;
  $("#lvl-" + def.id, row).textContent = "Lv " + cur + (def.maxLevel ? "/" + def.maxLevel : "");
  $("#eff-" + def.id, row).textContent = def.effectText(cur);

  const btn = $("#buy-" + def.id, row) as HTMLButtonElement;
  const cost = $("#cost-" + def.id, row);
  const hint = $("#hint-" + def.id, row);

  if (!unlocked) {
    btn.disabled = true; btn.textContent = "LOCKED";
    cost.textContent = "";
    hint.textContent = unlockHint(def);
    row.classList.remove("affordable");
    return;
  }
  hint.textContent = "";
  if (maxed) {
    btn.disabled = true; btn.textContent = "MAX";
    cost.textContent = "";
    row.classList.remove("affordable");
    return;
  }

  const mode = game.settings.buyMode;
  let n = mode === "max" ? affordable(def.id, "max") : (mode as number);
  if (mode === "max" && n === 0) n = 1; // show price of 1 when can't afford any
  const price = bulkCost(def.id, Math.max(1, n));
  const can = (game as any)[def.cost] >= price && (mode !== "max" || affordable(def.id, "max") > 0);
  const buyN = mode === "max" ? Math.max(1, affordable(def.id, "max")) : (mode as number);
  btn.disabled = !can;
  btn.textContent = mode === "max" ? `BUY ${buyN}` : `BUY x${mode}`;
  cost.textContent = `${fmt(price)} ${COST_LABEL[def.cost]}`;
  row.classList.toggle("affordable", can);
}

function unlockHint(def: UpgradeDef): string {
  // best-effort human hint derived from common gates
  const reqs: Record<string, string> = {
    dishGain: "Build 5 dishes", bandwidth: "Build 10 dishes", array: "Build 20 dishes",
    cpu: "Build 3 dishes", cpuClock: "Build 5 cores", cryo: "Build 3 cores",
    filter: "Cryo-Cooling Lv 3", rfi: "Matched Filter Lv 5", autoData: "Build 8 cores",
    autoBuy: "Earn insight (decode)", decoder: "Reach decoding phase",
    heuristics: "Earn insight", lexicon: "Collect 4 glyphs",
    transmitter: "Reach contact", semantics: "Reach contact", inference: "Reach contact",
  };
  return reqs[def.id] ? "⌁ " + reqs[def.id] : "";
}

// ---------------------------------------------------------------------------
// PHASE PANEL — listening log / decode tracks / contact / ending
// ---------------------------------------------------------------------------
function rebuildPhasePanel(): void {
  const title = $("#phase-panel-title");
  const body = $("#phase-body");
  body.dataset.built = "";
  endingTyped = false;
  if (game.phase === "listening") { title.textContent = "SIGNAL LOG"; buildListening(body); }
  else if (game.phase === "decoding") { title.textContent = "DECODE MATRIX // ALLOCATE COMPUTE"; buildDecoding(body); }
  else if (game.phase === "contact") { title.textContent = "FIRST CONTACT // CHANNEL OPEN"; buildContact(body); }
  else { title.textContent = "TRANSMISSION ENDED"; buildEnding(body); }
}

function updatePhasePanel(d: ReturnType<typeof computeDerived>): void {
  if (game.phase === "listening") updateListening(d);
  else if (game.phase === "decoding") updateDecoding(d);
  else if (game.phase === "contact") updateContact();
  else if (game.phase === "ended") updateEnding();
}

// ---- LISTENING ----
function buildListening(body: HTMLElement): void {
  body.innerHTML = `
    <div class="dim" style="font-size:12px;margin-bottom:8px">
      Push the array's signal-to-noise above the noise floor. Build dishes for DATA,
      cores for COMPUTE, and cryo-cooling to drop the NOISE FLOOR. When SNR clears the
      threshold, an anomaly charge builds toward detection.
    </div>
    <div id="listen-status"></div>
  `;
}
function updateListening(_d: ReturnType<typeof computeDerived>): void {
  const s = document.getElementById("listen-status");
  if (!s) return;
  const lines: string[] = [];
  if (game.snr < 40) {
    const need = 40;
    lines.push(`<div>STATUS: <span class="warn">SCANNING</span> — SNR ${fmt(game.snr,1)} / ${need} to register.</div>`);
    lines.push(`<div class="dim">The sky is hiss. Lower the noise floor and raise throughput.</div>`);
  } else if (!game.detected) {
    lines.push(`<div>STATUS: <span class="accent">CANDIDATE LOCKED</span> — confirming…</div>`);
    lines.push(`<div class="dim">Anomaly charge ${fmtPct(game.anomalyCharge)}. Hold SNR above threshold.</div>`);
  }
  s.innerHTML = lines.join("");
}

// ---- DECODING ----
function buildDecoding(body: HTMLElement): void {
  body.innerHTML = `
    <div class="dim" style="font-size:12px;margin-bottom:8px">
      COMPUTE throughput drives decoding. Allocate effort across tracks with the sliders.
      Each completed track unlocks glyphs, a message fragment, and INSIGHT.
    </div>
    <div id="tracks"></div>
    <div class="panel-title" style="margin-top:10px"><span>MESSAGE</span></div>
    <div class="terminal" id="phase-body-frag"></div>
    <div class="panel-title" style="margin-top:10px"><span>GLYPH LEXICON</span></div>
    <div class="glyph-list" id="glyphs"></div>
  `;
  fragTyper = new Typer($("#phase-body-frag"));
  lastFragShown = -1;
}
function updateDecoding(d: ReturnType<typeof computeDerived>): void {
  const host = document.getElementById("tracks");
  if (!host) return;
  const sig = TRACKS.map((t) => t.id + ((game.tracks[t.id] ?? 0) >= 1 ? "D" : "")).join();
  if (host.dataset.sig !== sig) {
    host.dataset.sig = sig;
    host.innerHTML = "";
    for (const t of TRACKS) {
      const done = (game.tracks[t.id] ?? 0) >= 1;
      const locked = t.requires && (game.tracks[t.requires] ?? 0) < 1;
      if (locked && !done) continue;
      const row = el("div", "track" + (done ? " done" : ""));
      row.id = "tr-" + t.id;
      row.innerHTML = `
        <div class="t-head"><span>${t.name}</span><span class="mono" id="tp-${t.id}"></span></div>
        <div class="t-desc">${t.desc}</div>
        <div class="meter"><i id="tbar-${t.id}"></i></div>
        ${done ? '<div class="accent" style="font-size:11px;margin-top:3px">✓ DECODED</div>' :
          `<div class="alloc-row"><span class="dim" style="font-size:10px">ALLOC</span>
            <input type="range" min="0" max="100" id="al-${t.id}">
            <span class="alloc-pct mono" id="ap-${t.id}"></span></div>`}
      `;
      host.appendChild(row);
      if (!done) {
        const slider = $("#al-" + t.id, row) as HTMLInputElement;
        slider.value = String(Math.round((game.alloc[t.id] ?? 0) * 100));
        slider.oninput = () => setAlloc(t.id, parseInt(slider.value) / 100);
      }
    }
  }
  // per-frame fills
  for (const t of TRACKS) {
    const prog = game.tracks[t.id] ?? 0;
    const bar = document.getElementById("tbar-" + t.id);
    if (bar) bar.style.width = (prog * 100).toFixed(1) + "%";
    const lbl = document.getElementById("tp-" + t.id);
    if (lbl) {
      if (prog >= 1) lbl.textContent = "100%";
      else {
        const frac = game.alloc[t.id] ?? 0;
        const totalAlloc = TRACKS.reduce((s, x) => s + ((game.tracks[x.id] ?? 0) < 1 ? (game.alloc[x.id] ?? 0) : 0), 0) || 1;
        const myRate = d.decodeRate * (frac / totalAlloc) / t.work;
        const eta = myRate > 0 ? (1 - prog) / myRate : Infinity;
        lbl.textContent = fmtPct(prog) + (frac > 0 ? ` · ${fmtTime(eta)}` : "");
      }
    }
    const ap = document.getElementById("ap-" + t.id);
    if (ap) ap.textContent = Math.round((game.alloc[t.id] ?? 0) * 100) + "%";
  }
  updateGlyphs();
  updateFragments();
}

function updateGlyphs(): void {
  const host = document.getElementById("glyphs");
  if (!host) return;
  if (host.dataset.n === String(game.glyphs.length)) return;
  host.dataset.n = String(game.glyphs.length);
  host.innerHTML = "";
  for (const g of Object.keys(GLYPH_MEANING)) {
    const got = game.glyphs.includes(g);
    const cell = el("div", "glyph" + (got ? "" : " locked"));
    cell.innerHTML = `<div class="g">${got ? g : "?"}</div><span class="m">${got ? GLYPH_MEANING[g] : "———"}</span>`;
    host.appendChild(cell);
  }
}

function updateFragments(): void {
  const idx = game.fragments - 1;
  if (idx >= 0 && idx !== lastFragShown && idx < FRAGMENTS.length) {
    lastFragShown = idx;
    fragTyper.type(FRAGMENTS[idx]);
  }
}

// ---- CONTACT ----
function buildContact(body: HTMLElement): void {
  body.innerHTML = `
    <div class="dim" style="font-size:12px;margin-bottom:6px">
      The channel is two-way. You do not yet know what it is — infer its nature from
      how TRUST responds, then choose your final posture. Your last choice decides the ending.
    </div>
    <div id="archetype-line" class="faint" style="font-size:11px;margin-bottom:6px"></div>
    <div class="alien-line" id="alien-line"></div>
    <div class="choices" id="choices"></div>
  `;
  alienTyper = new Typer($("#alien-line"));
  lastNode = "";
}
function updateContact(): void {
  const node = dialogueById(game.contact.node);
  const arch = ARCHETYPES.find((a) => a.id === game.contact.archetype);
  const archLine = document.getElementById("archetype-line");
  if (archLine && arch) {
    if (game.contact.archetypeRevealed) {
      archLine.innerHTML = `INFERENCE COMPLETE → <span class="accent">${arch.name}</span>: ${arch.hint}`;
    } else {
      archLine.textContent = "INFERENCE: insufficient data — its nature is unknown. Watch how trust moves.";
    }
  }
  if (!node) return;
  if (game.contact.node !== lastNode) {
    lastNode = game.contact.node;
    alienTyper.type(node.alien(game));
    buildChoices(node.options);
  }
}
function buildChoices(opts: DialogueOption[]): void {
  const host = document.getElementById("choices");
  if (!host) return;
  host.innerHTML = "";
  for (const o of opts) {
    const b = el("button", "choice") as HTMLButtonElement;
    b.innerHTML = `${o.text}<span class="tag">[${o.tag.toUpperCase()}]</span>`;
    b.onclick = () => {
      chooseDialogue(o);
      saveNow();
      // refresh on next frame via node change; clear immediately to prevent dbl-click
      host.innerHTML = '<div class="dim">…transmitting…</div>';
    };
    host.appendChild(b);
  }
}

// ---- ENDING ----
function buildEnding(body: HTMLElement): void {
  body.innerHTML = `<div id="ending-host"></div>`;
}
function updateEnding(): void {
  if (endingTyped) return;
  const host = document.getElementById("ending-host");
  const id = game.contact.ending;
  if (!host || !id) return;
  const e = ENDINGS[id];
  if (!e) return;
  endingTyped = true;
  const screen = el("div", "ending-screen " + e.tone);
  screen.innerHTML = `<h1>${e.title}</h1><div class="ending-body" id="end-body"></div>`;
  host.innerHTML = "";
  host.appendChild(screen);
  const arch = ARCHETYPES.find((a) => a.id === game.contact.archetype);
  const lines = [...e.body, "", arch ? `It was ${arch.name}. ${arch.hint}` : "", "",
    `Final trust: ${game.contact.trust.toFixed(0)} · Exchanges: ${game.contact.exchanges}`,
    "", "── Press SYS to export your save, hard-reset, and begin again. ──"];
  typeLines($("#end-body", screen), lines, 0);
}
function typeLines(host: HTMLElement, lines: string[], i: number): void {
  if (i >= lines.length) return;
  const line = el("div");
  host.appendChild(line);
  const tp = new Typer(line, 16);
  tp.type(lines[i]);
  const wait = Math.max(400, lines[i].length * 18 + 250);
  window.setTimeout(() => typeLines(host, lines, i + 1), wait);
}

// ---------------------------------------------------------------------------
// ACHIEVEMENTS
// ---------------------------------------------------------------------------
function buildAchievements(): void {
  // rendered lazily in update via signature
}
function updateAchievements(): void {
  const host = $("#achievements");
  $("#ach-count").textContent = `${game.achievements.length}/${ACHIEVEMENTS.length}`;
  if (host.dataset.n === String(game.achievements.length) && host.childElementCount > 0) return;
  host.dataset.n = String(game.achievements.length);
  host.innerHTML = "";
  for (const a of ACHIEVEMENTS) {
    const got = game.achievements.includes(a.id);
    if (a.hidden && !got) continue;
    const cell = el("div", "ach" + (got ? " got" : ""));
    cell.innerHTML = `<div class="an">${got ? a.name : "???"}</div><div class="ad">${got ? a.desc : "hidden"}</div>`;
    host.appendChild(cell);
  }
}

// ---------------------------------------------------------------------------
// EVENTS -> toasts / audio
// ---------------------------------------------------------------------------
function flushEvents(): void {
  for (const ev of drainEvents()) {
    switch (ev.type) {
      case "toast": toast(ev.text); break;
      case "detect": toast("◉ ANOMALY DETECTED", 5000); break;
      case "achievement": {
        const a = ACHIEVEMENTS.find((x) => x.id === ev.id);
        if (a) toast("★ ACHIEVEMENT: " + a.name);
        break;
      }
      case "glyph": toast("GLYPH ACQUIRED: " + ev.glyph); break;
      case "phase": break;
      case "ending": break;
      default: break;
    }
  }
}

function toast(text: string, dur = 3500): void {
  const host = $("#toasts");
  const t = el("div", "toast", text);
  host.appendChild(t);
  window.setTimeout(() => { t.remove(); }, dur);
  while (host.childElementCount > 5) host.firstElementChild?.remove();
}

// ---------------------------------------------------------------------------
// SETTINGS MODAL
// ---------------------------------------------------------------------------
function openSettings(): void {
  const m = $("#modal");
  m.innerHTML = `
    <h2>SYSTEM</h2>
    <div class="dim" style="font-size:12px;margin-bottom:8px">Export / import your save, toggle audio &amp; CRT, or wipe the array.</div>
    <div class="row">
      <button id="m-export">EXPORT SAVE</button>
      <button id="m-import">IMPORT SAVE</button>
      <button id="m-mute">${game.settings.muted ? "UNMUTE" : "MUTE"}</button>
      <button id="m-crt">CRT: ${game.settings.crtEffects ? "ON" : "OFF"}</button>
    </div>
    <textarea id="m-save" placeholder="paste a save code here to import, or read your exported code…"></textarea>
    <div class="row">
      <button id="m-reset" class="bad" style="border-color:var(--bad);color:var(--bad)">HARD RESET</button>
      <span class="spacer" style="flex:1"></span>
      <button id="m-close">CLOSE</button>
    </div>
    <div id="m-msg" class="dim" style="font-size:11px;margin-top:6px"></div>
  `;
  $("#modal-bg").classList.add("show");
  const ta = $("#m-save") as HTMLTextAreaElement;
  const msg = $("#m-msg");
  $("#m-export").onclick = () => {
    const code = exportSave();
    ta.value = code;
    ta.select();
    try { void navigator.clipboard.writeText(code); msg.textContent = "Copied to clipboard."; }
    catch { msg.textContent = "Save shown above — copy it."; }
  };
  $("#m-import").onclick = () => {
    if (importSave(ta.value)) { msg.textContent = "Imported. Reloading…"; setTimeout(() => location.reload(), 500); }
    else { msg.textContent = "Import failed — invalid code."; audio.buzz(); }
  };
  $("#m-mute").onclick = () => { ($("#btn-mute") as HTMLButtonElement).click(); closeModal(); };
  $("#m-crt").onclick = () => { ($("#btn-crt") as HTMLButtonElement).click(); closeModal(); };
  $("#m-reset").onclick = () => {
    if (confirm("HARD RESET: erase all progress? This cannot be undone.")) {
      hardReset(); location.reload();
    }
  };
  $("#m-close").onclick = closeModal;
  $("#modal-bg").onclick = (e) => { if (e.target === $("#modal-bg")) closeModal(); };
}
function closeModal(): void { $("#modal-bg").classList.remove("show"); }

// expose a toast helper for offline-summary in main
export function showToast(text: string, dur = 6000): void { toast(text, dur); }
