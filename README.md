# SIGNAL

> A SETI incremental. Listen to cosmic static, decode an alien message, then negotiate first contact — on a Cold-War phosphor-CRT terminal.

You operate a radio-telescope array. Somewhere under forty decibels of hiss, something is repeating. Find it. Understand it. And then decide what to say back — because it is listening, and it has been waiting a very long time.

Built with TypeScript + Vite. No frameworks, no art assets — the oscilloscope, the scrolling waterfall spectrogram, and every sound are generated live from game state on `<canvas>` and the WebAudio API.

---

## Run it

```bash
npm install
npm run dev      # local dev server (http://localhost:5173)
npm run build    # type-check (tsc) + production build into dist/
npm run preview  # serve the production build
```

The game saves to `localStorage` automatically every 10 seconds and on exit. Use **SYS** in the top bar to export/import a save code or hard-reset.

---

## The three phases

### 1 · LISTENING
Push your array's **signal-to-noise ratio (SNR)** above the ever-present **NOISE FLOOR**.

- **Parabolic Dishes** capture raw **DATA**.
- **Correlator Cores** convert data into **COMPUTE**.
- **Cryo-Cooling**, **Matched Filters** and **RFI Shielding** drop the noise floor and sharpen SNR gain.

When SNR clears the detection threshold, an **anomaly charge** builds. Hold the signal long enough and it confirms — a repeating, non-natural source. The live oscilloscope and waterfall react in real time: as SNR climbs, a coherent carrier emerges from the hiss and the waterfall's anomaly band brightens and narrows.

### 2 · DECODING
**COMPUTE** is now the master allocatable resource. Distribute it across decode tracks with the allocation sliders:

`Carrier Lock → Prime Key → Image Raster → Grammar Parse → Lexicon Build → Comprehension`

Each completed track unlocks **glyphs** for your lexicon, types out a **message fragment**, and rewards **INSIGHT** (the meta-currency for late-game upgrades). Completing **Comprehension** opens a two-way channel.

### 3 · CONTACT
The alien is one of four hidden **archetypes** — the Gardener, the Auditor, the Predator, or the Mirror — each of which weighs your actions differently. You don't know which. Watch how **TRUST** responds to your choices and **infer its nature**; the *Intent Inference* upgrade speeds this up.

Every choice carries an action tag (cooperate / conceal / probe / gift / threaten / defer) and an **EXPOSURE** cost (how much of Earth you reveal). Your **final posture** decides the ending.

---

## Core systems

| System | What it means |
| --- | --- |
| **COMPUTE** | The master allocatable resource — converts data, then drives decoding. |
| **NOISE FLOOR** | The ever-present threshold. Lower is better; it gates detection and shapes the scope/waterfall. |
| **SNR** | Signal-to-noise. Relaxes toward a target set by throughput vs. noise floor. |
| **INSIGHT** | Earned from decoding; buys heuristics, the lexicon engine, and contact-era gear. |
| **TRUST / EXPOSURE / COMPREHENSION** | The phase-3 inference loop: read the alien, manage risk, understand more. |

19 upgrades across Antenna Array, Compute, Noise Control, Automation, Decoding, and Contact. 18 achievements. Offline progress (8h cap, 60% efficiency) with a welcome-back summary. Buy x1 / x10 / x100 / MAX with live affordability and unlock hints.

---

## Endings

Your final choice, the alien's true disposition, your cumulative trust, and your dominant strategy combine into one of five outcomes:

- **Mutual Transcendence** — high trust, benevolent, openness wins.
- **The Uplift** — high trust earned chiefly through gifts.
- **The Rational Pact** — reason-led, mutual proof, a cold treaty of equals.
- **The Great Silence** — you withdraw and quarantine Earth from the stars.
- **Weighed and Found Wanting** — trust collapses, or you feed something hungry.

---

## Art direction

Phosphor green on near-black by default, with an **AMBER** theme toggle. Scanlines, CRT vignette, soft bloom, and an occasional flicker — toggleable via **CRT**. Everything is monospace (IBM Plex Mono / VT323). Messages and the alien's lines are typed out character-by-character with a blinking cursor. Generated audio — static hiss that tracks the noise floor, tuning beeps, Geiger detection ticks, signal tones — is opt-in via the **AUDIO** toggle.

---

## Project layout

```
src/
  main.ts              entry: boot, offline reconcile, sim + render loops, autosave
  styles.css           CRT terminal aesthetic
  modules/
    state.ts           serializable game state + helpers
    loop.ts            fixed-timestep sim, derived rates, phase transitions, purchasing
    content.ts         data-driven balance: upgrades, tracks, glyphs, archetypes, endings
    save.ts            persistence, export/import, offline progress
    format.ts          number/time formatting
    audio.ts           generated WebAudio
  ui/
    app.ts             builds the terminal UI, routes input back into the engine
    scope.ts           live oscilloscope canvas renderer
    waterfall.ts       scrolling spectrogram canvas renderer
    typer.ts           terminal typewriter effect
```

All game balance lives in `content.ts`; the engine reads it and the UI only presents it.
