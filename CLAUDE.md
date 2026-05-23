# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

BeatPT is a novelty "AI DJ" desktop app. Users import audio tracks, load them onto two decks, and mash the keyboard to trigger random DJ effects while fake AI-thinking overlays play. It's a Tauri 2 app with a React/TypeScript frontend and a minimal Rust backend (the Rust side only initializes Tauri plugins — all audio logic lives in the browser via the Web Audio API).

## Commands

```sh
bun install              # install dependencies
bun run dev              # full Tauri desktop app (launches native window + Vite dev server on :1420)
bun run vite:dev         # frontend only in browser (http://localhost:1420)
bun run build            # production build (Tauri + Vite)
bun run vite:build       # frontend-only production build
```

No test runner, linter, or formatter is configured.

## Architecture

### Audio Pipeline (all in-browser, no Rust)

`AudioEngine` (singleton) owns the Web Audio graph:

```
Deck source → GainNode → EQ (low/mid/high shelving) → AnalyserNode → CrossfaderGain → MasterLimiter → destination
```

- Two parallel signal chains (Deck A, Deck B) merge through equal-power crossfader gains into a shared `DynamicsCompressorNode` limiter.
- EQ is three `BiquadFilterNode`s: lowshelf 250 Hz, peaking 1 kHz, highshelf 4 kHz. Range: -12 to +12 dB.
- All gain changes use `linearRampToValueAtTime` with a 10 ms ramp to avoid clicks.

### Effects System (`src/engine/Effects.ts`, `DJActions.ts`)

Effects implement the `DJEffect` interface (`apply` / `remove`). They splice temporary Web Audio nodes into the deck's output for a fixed duration, then self-disconnect. Available effects: EchoOut, FilterSweep, StutterEffect, Reverb, plus EQ-based actions (BassSwap, EQ Kill) and gain-scheduling actions (Beat Drop, Volume Pump, Spinback).

`DJActions.ts` defines a weighted pool of 10 actions. `triggerRandomAction()` picks one and executes it. Smooth Crossfade has 0.5 weight; everything else is 1.

### Keyboard Mash Mode (`useKeyboardMash`)

When mash mode is active, every keydown (except modifiers/space/escape) fires `triggerRandomAction`, shows a random "AI thinking" overlay for 300-800ms, bumps the hype meter, and randomizes transition confidence. Hype decays by 10 after 3s of inactivity.

### State Management

Single Zustand store (`useAppStore`) holds: track library, both deck states (track/playing/time/volume/EQ), crossfader position, mash mode toggle, action log (last 20), hype/transition meters, AI thinking overlay, and DJ name generator.

### File Import

Two paths — `useFileImport` (hidden `<input>` + drag-and-drop for the library panel) and `useAudioEngine.loadTrack` (deck-specific loading via `<input>`). Both decode audio, run `detectBPM` (peak-finding autocorrelation on downsampled waveform), generate waveform data (200 peak samples), and parse ID3v2 metadata (title, artist, album art via `MetadataParser`).

### Tauri Backend (`src-tauri/`)

The Rust side is minimal — `lib.rs` only initializes `tauri-plugin-dialog` and `tauri-plugin-fs`. No custom Tauri commands exist. The dialog plugin is available for native file pickers but the current UI uses browser `<input>` elements instead.

## Design Tokens

Tailwind 4 theme defined in `src/styles/index.css` via `@theme`. Key tokens: `bg-primary` (#07070b), `accent` (#d4872c amber), `accent-2` (#6b9fff blue), `accent-3`/`success` (#4ade80 green). Font: Satoshi (loaded from Fontshare CDN).

## UI Components

Custom primitives in `src/components/ui/` (Button, Card, Label, Badge) — no component library. All styling is Tailwind utility classes using the custom theme tokens.
