# BeatPT

AI-powered DJ mixing application built with Tauri, React, and the Web Audio API.

## Features

- **Dual Deck System** — Independent playback, volume, and 3-band EQ (low/mid/high) per deck
- **Crossfader** — Equal-power mixing between decks with smooth gain ramping
- **Track Library** — Import and manage audio files with automatic BPM detection and waveform generation
- **Real-time Waveform** — Canvas-based waveform visualization with playback progress
- **Master Limiter** — Dynamics compression on the output bus
- **Mash Mode** — Keyboard visualizer for live performance
- **AI DJ Metrics** — Hype meter, transition confidence, and action log

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2 |
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS 4, Satoshi font |
| State | Zustand |
| Audio | Web Audio API, wavesurfer.js |
| Build | Vite, Bun |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install) (required by Tauri)

### Install

```sh
bun install
```

### Development

```sh
# Full Tauri app (desktop window)
bun run dev

# Frontend only (browser)
bun run vite:dev
```

### Build

```sh
bun run build
```

## Project Structure

```
src/
├── components/       # React UI components
│   ├── ui/           # Reusable primitives (Button, Card, Label, Badge)
│   ├── Deck.tsx      # Audio deck with controls and EQ
│   ├── Waveform.tsx  # Canvas waveform renderer
│   ├── Crossfader.tsx
│   ├── TrackLibrary.tsx
│   └── ...
├── engine/           # Audio engine, BPM detection, effects
├── hooks/            # useAudioEngine, useKeyboardMash, useFileImport
├── stores/           # Zustand state management
└── styles/           # Tailwind theme and design tokens
```
