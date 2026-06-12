import { AudioEngine } from './AudioEngine';
import { TransitionPlan, TransitionType, FADE_BEATS } from './TransitionStrategy';
import { EnergySegment } from './EnergyAnalyzer';
import { findMixInPoint } from './MixPointFinder';
import { EchoOut } from './Effects';

export interface TransitionTrack {
  bpm: number;
  duration: number;
  beatPositions: number[];
  energySegments: EnergySegment[];
}

export interface TransitionContext {
  engine: AudioEngine;
  fromDeck: 'A' | 'B';
  toDeck: 'A' | 'B';
  fromTrack: TransitionTrack;
  toTrack: TransitionTrack;
  fromSpeed: number;
  toSpeed: number;
  plan: TransitionPlan;
  onComplete: () => void;
  onProgress: (confidence: number, message: string) => void;
  setCrossfaderPosition: (pos: number) => void;
  updateDeck: (deck: 'A' | 'B', updates: { isPlaying?: boolean; currentTime?: number; speed?: number }) => void;
}

const TICK_MS = 100;
const TICK_S = TICK_MS / 1000;

function ramp(signal: AbortSignal, durationS: number, onStep: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const steps = Math.max(1, Math.round((durationS * 1000) / TICK_MS));
    let step = 0;
    const id = setInterval(() => {
      step++;
      onStep(step / steps);
      if (step >= steps) {
        clearInterval(id);
        resolve();
      }
    }, TICK_MS);
    signal.addEventListener('abort', () => { clearInterval(id); resolve(); }, { once: true });
  });
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Rate that matches the incoming track's tempo to the outgoing deck's effective
// tempo, treating half/double BPM as equivalent so the correction stays small.
function computeMatchRate(fromBPM: number, fromSpeed: number, toBPM: number): number {
  const target = fromBPM * fromSpeed;
  let best = 1;
  let bestErr = Infinity;
  for (const mult of [0.5, 1, 2]) {
    const rate = target / (toBPM * mult);
    const err = Math.abs(Math.log(rate));
    if (err < bestErr) {
      bestErr = err;
      best = rate;
    }
  }
  return Math.max(0.5, Math.min(2, best));
}

function gridPhase(track: TransitionTrack): number {
  const beat = 60 / track.bpm;
  return track.beatPositions.length ? track.beatPositions[0] % beat : 0;
}

// Wall-clock seconds until the deck's next beat
function timeToNextBeat(track: TransitionTrack, position: number, rate: number): number {
  const beat = 60 / track.bpm;
  const phase = gridPhase(track);
  let dt = phase + Math.ceil((position - phase) / beat) * beat - position;
  if (dt < 0.02) dt += beat;
  return dt / rate;
}

function snapToBeat(track: TransitionTrack, position: number): number {
  const beat = 60 / track.bpm;
  const phase = gridPhase(track);
  return Math.max(0, phase + Math.round((position - phase) / beat) * beat);
}

// Start the incoming deck at its mix-in point, offset so that its beat grid
// lands in phase with the outgoing deck's next beat.
function startIncomingAligned(ctx: TransitionContext, rate: number): void {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed } = ctx;

  const mixIn = snapToBeat(toTrack, findMixInPoint(toTrack.energySegments, toTrack.duration));
  const dt = timeToNextBeat(fromTrack, engine.getPlaybackPosition(fromDeck), fromSpeed);
  let offset = mixIn - dt * rate;
  const beat = 60 / toTrack.bpm;
  while (offset < 0) offset += beat;

  engine.setPlaybackRate(toDeck, rate);
  engine.seek(toDeck, offset);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true, currentTime: offset, speed: rate });
}

// Move the crossfader fully onto the outgoing deck before the new track starts
async function parkCrossfader(ctx: TransitionContext, signal: AbortSignal, fromSide: number): Promise<void> {
  const { engine } = ctx;
  const start = engine.getCrossfaderValue();
  if (Math.abs(start - fromSide) <= 0.01) return;
  await ramp(signal, 0.8, (t) => {
    const pos = start + (fromSide - start) * t;
    engine.setCrossfader(pos, TICK_S);
    ctx.setCrossfaderPosition(pos);
  });
}

interface BlendOpts {
  tempoMatch: boolean;
  inHighCut: number;  // dB the incoming highs start below their setting, swept in over the first 60%
  inMidCut: number;   // same for the incoming mids
  outHighDrop: number; // dB the outgoing highs recede over the back half
  outMidDrop: number;  // same for the outgoing mids
}

const BLEND_OPTS: Record<Exclude<TransitionType, 'echo-drop'>, BlendOpts> = {
  'long-blend': { tempoMatch: true, inHighCut: 4, inMidCut: 3, outHighDrop: 4, outMidDrop: 5 },
  'tempo-ramp': { tempoMatch: true, inHighCut: 4, inMidCut: 3, outHighDrop: 4, outMidDrop: 5 },
  'filter-sweep': { tempoMatch: true, inHighCut: 8, inMidCut: 4, outHighDrop: 8, outMidDrop: 5 },
  'breakdown-bridge': { tempoMatch: false, inHighCut: 4, inMidCut: 6, outHighDrop: 6, outMidDrop: 8 },
};

export function executeTransition(ctx: TransitionContext): AbortController {
  const controller = new AbortController();
  if (ctx.plan.type === 'echo-drop') {
    runEchoCut(ctx, controller.signal);
  } else {
    runBlend(ctx, controller.signal, BLEND_OPTS[ctx.plan.type]);
  }
  return controller;
}

async function runBlend(ctx: TransitionContext, signal: AbortSignal, opts: BlendOpts): Promise<void> {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed, toSpeed } = ctx;

  const rate = opts.tempoMatch ? computeMatchRate(fromTrack.bpm, fromSpeed, toTrack.bpm) : toSpeed;
  const wallBeat = 60 / (fromTrack.bpm * fromSpeed);
  const fadeS = Math.min(24, Math.max(5, FADE_BEATS[ctx.plan.type] * wallBeat));

  const savedFromLow = engine.getEQ(fromDeck, 'low');
  const savedFromMid = engine.getEQ(fromDeck, 'mid');
  const savedFromHigh = engine.getEQ(fromDeck, 'high');
  const savedToLow = engine.getEQ(toDeck, 'low');
  const savedToMid = engine.getEQ(toDeck, 'mid');
  const savedToHigh = engine.getEQ(toDeck, 'high');

  const fromSide = fromDeck === 'A' ? -1 : 1;
  const toSide = -fromSide;
  await parkCrossfader(ctx, signal, fromSide);
  if (signal.aborted) return;

  // Incoming starts beat-aligned and tempo-matched, with its bass out of the
  // way and its mids/highs pulled back so it eases in rather than slamming in
  engine.setEQ(toDeck, 'low', -12);
  engine.setEQ(toDeck, 'mid', Math.max(-12, savedToMid - opts.inMidCut));
  engine.setEQ(toDeck, 'high', Math.max(-12, savedToHigh - opts.inHighCut));
  startIncomingAligned(ctx, rate);
  ctx.onProgress(86, 'Beatmatched...');

  await ramp(signal, fadeS, (t) => {
    const pos = fromSide + (toSide - fromSide) * smoothstep(t);
    engine.setCrossfader(pos, TICK_S);
    ctx.setCrossfaderPosition(pos);

    // Incoming mids/highs sweep up to their settings over the first 60%
    const inT = smoothstep(Math.min(1, t / 0.6));
    engine.setEQ(toDeck, 'mid', Math.max(-12, savedToMid - opts.inMidCut) + opts.inMidCut * inT, TICK_S);
    engine.setEQ(toDeck, 'high', Math.max(-12, savedToHigh - opts.inHighCut) + opts.inHighCut * inT, TICK_S);

    // Swap basslines through the middle of the blend
    const swapT = Math.min(1, Math.max(0, (t - 0.45) / 0.2));
    if (swapT > 0) {
      engine.setEQ(fromDeck, 'low', savedFromLow + (-12 - savedFromLow) * swapT, TICK_S);
      engine.setEQ(toDeck, 'low', -12 + (savedToLow + 12) * swapT, TICK_S);
    }

    // Outgoing mids/highs recede through the back half so the old track
    // steps aside instead of just getting quieter
    if (t > 0.5) {
      const outT = smoothstep((t - 0.5) * 2);
      engine.setEQ(fromDeck, 'mid', savedFromMid - outT * opts.outMidDrop, TICK_S);
      engine.setEQ(fromDeck, 'high', savedFromHigh - outT * opts.outHighDrop, TICK_S);
    }

    ctx.onProgress(Math.round(86 + t * 9), 'Blending...');
  });
  if (signal.aborted) return;

  engine.stop(fromDeck);
  ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });
  engine.setEQ(fromDeck, 'low', savedFromLow);
  engine.setEQ(fromDeck, 'mid', savedFromMid);
  engine.setEQ(fromDeck, 'high', savedFromHigh);
  engine.setEQ(toDeck, 'low', savedToLow);
  engine.setEQ(toDeck, 'mid', savedToMid);
  engine.setEQ(toDeck, 'high', savedToHigh);

  // Ease the new track back to its own tempo, slowly enough not to hear the bend
  if (Math.abs(rate - toSpeed) > 0.002) {
    await ramp(signal, 12, (t) => {
      engine.setPlaybackRate(toDeck, rate + (toSpeed - rate) * smoothstep(t), TICK_S);
    });
    if (signal.aborted) return;
    engine.setPlaybackRate(toDeck, toSpeed);
  }
  ctx.updateDeck(toDeck, { speed: toSpeed });
  ctx.onComplete();
}

// Quick cut: echo tail on the outgoing deck while the new track slams in on the
// next beat at its own tempo. No tempo match — used for large BPM gaps.
async function runEchoCut(ctx: TransitionContext, signal: AbortSignal): Promise<void> {
  const { engine, fromDeck, toDeck, fromTrack, fromSpeed, toSpeed } = ctx;

  const wallBeat = 60 / (fromTrack.bpm * fromSpeed);
  const fadeS = Math.min(4, Math.max(1.5, FADE_BEATS['echo-drop'] * wallBeat));

  const fromSide = fromDeck === 'A' ? -1 : 1;
  const toSide = -fromSide;
  await parkCrossfader(ctx, signal, fromSide);
  if (signal.aborted) return;

  // The echo's wet path bypasses the crossfader, so its tail rings out
  // while the fader moves to the incoming deck
  const echo = new EchoOut();
  echo.apply(engine.getDeckOutputNode(fromDeck), fromTrack.bpm, engine.getContext());
  signal.addEventListener('abort', () => echo.remove(), { once: true });

  startIncomingAligned(ctx, toSpeed);
  ctx.onProgress(88, 'Echo out...');

  await ramp(signal, fadeS, (t) => {
    const pos = fromSide + (toSide - fromSide) * smoothstep(t);
    engine.setCrossfader(pos, TICK_S);
    ctx.setCrossfaderPosition(pos);
    ctx.onProgress(Math.round(88 + t * 7), 'Echo drop...');
  });
  if (signal.aborted) return;

  engine.stop(fromDeck);
  ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });
  ctx.onComplete();
}
