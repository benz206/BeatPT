import { AudioEngine } from './AudioEngine';
import { TransitionPlan, TransitionType, FADE_BEATS } from './TransitionStrategy';
import { EnergySegment } from './EnergyAnalyzer';
import { findMixInPoint } from './MixPointFinder';
import { EchoOut } from './Effects';

export interface TransitionTrack {
  bpm: number;
  duration: number;
  beatPositions: number[];
  downbeatIndex: number;
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

// Abortable wait that resolves after durationS or as soon as the signal fires.
function sleep(signal: AbortSignal, durationS: number): Promise<void> {
  return new Promise((resolve) => {
    if (durationS <= 0) { resolve(); return; }
    const id = setTimeout(resolve, durationS * 1000);
    signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
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

// Average beat interval, used to extrapolate past the ends of the tracked grid.
function avgBeat(track: TransitionTrack): number {
  return 60 / track.bpm;
}

// Index of the first beat at or after `position`, via binary search. Returns
// beatPositions.length when `position` is past the last tracked beat.
function beatIndexAtOrAfter(beats: number[], position: number): number {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < position) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Time of the last beat at or before `position`. Beyond the array ends the grid
// is extrapolated with the average beat interval.
function beatBefore(track: TransitionTrack, position: number): number {
  const beats = track.beatPositions;
  if (beats.length === 0) return position;
  const i = beatIndexAtOrAfter(beats, position);
  if (i === 0) {
    const dt = beats[0] - position;
    return beats[0] - Math.ceil(dt / avgBeat(track)) * avgBeat(track);
  }
  if (beats[i] === position) return position;
  if (i >= beats.length) {
    const last = beats[beats.length - 1];
    return last + Math.floor((position - last) / avgBeat(track)) * avgBeat(track);
  }
  return beats[i - 1];
}

// Time of the first beat strictly after `position`. Extrapolated past the ends.
function beatAfter(track: TransitionTrack, position: number): number {
  const beats = track.beatPositions;
  if (beats.length === 0) return position + avgBeat(track);
  const i = beatIndexAtOrAfter(beats, position);
  if (i < beats.length && beats[i] > position) return beats[i];
  if (i >= beats.length) {
    const last = beats[beats.length - 1];
    return last + (Math.floor((position - last) / avgBeat(track)) + 1) * avgBeat(track);
  }
  // beats[i] === position: take the next one (extrapolating if it's the last)
  if (i + 1 < beats.length) return beats[i + 1];
  return beats[i] + avgBeat(track);
}

// Time of the next bar boundary: a beat whose array index ≡ downbeatIndex (mod 4)
// and that lands more than 50 ms ahead. Falls back to the next beat when there
// aren't enough tracked beats to know where bars sit.
function nextBarTime(track: TransitionTrack, position: number): number {
  const beats = track.beatPositions;
  if (beats.length < 4) return beatAfter(track, position);
  const target = ((track.downbeatIndex % 4) + 4) % 4;
  const start = beatIndexAtOrAfter(beats, position + 0.05);
  for (let i = start; i < beats.length; i++) {
    if (i % 4 === target && beats[i] > position + 0.05) return beats[i];
  }
  // Past the last bar: extrapolate one bar at a time from the last bar beat.
  let lastBar = -1;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (i % 4 === target) { lastBar = beats[i]; break; }
  }
  if (lastBar < 0) return beatAfter(track, position);
  const bar = 4 * avgBeat(track);
  return lastBar + (Math.floor((position + 0.05 - lastBar) / bar) + 1) * bar;
}

// Map a phase difference to [-0.5, 0.5) so corrections always take the short way.
function wrapPhase(e: number): number {
  return e - Math.round(e);
}

// Continuous beat coordinate (beat index + intra-beat fraction) at a position,
// extrapolated past the tracked grid with the average interval. Comparing these
// (scaled by the tempo multiple) keeps phase error well-defined even when the
// decks are matched at half/double time.
function continuousBeatAt(track: TransitionTrack, position: number): number {
  const beats = track.beatPositions;
  if (beats.length === 0) return position / avgBeat(track);
  const prev = beatBefore(track, position);
  const next = beatAfter(track, position);
  const span = next - prev;
  const frac = span > 0 ? (position - prev) / span : 0;
  let idx: number;
  if (prev < beats[0]) {
    idx = Math.round((prev - beats[0]) / avgBeat(track));
  } else if (prev > beats[beats.length - 1]) {
    idx = beats.length - 1 + Math.round((prev - beats[beats.length - 1]) / avgBeat(track));
  } else {
    idx = beatIndexAtOrAfter(beats, prev);
  }
  return idx + frac;
}

// Start the incoming deck at its phrase-aligned mix-in point, scheduled on the
// AudioContext clock so it lands exactly on the outgoing deck's next bar (or beat
// for the snappy echo cut). Returns the wall-clock delay until it sounds.
function scheduleIncoming(ctx: TransitionContext, rate: number, alignToBar: boolean): number {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed } = ctx;

  const mixIn = findMixInPoint(toTrack);
  const fromPos = engine.getPlaybackPosition(fromDeck);
  const target = alignToBar ? nextBarTime(fromTrack, fromPos) : beatAfter(fromTrack, fromPos);
  const dtWall = Math.max(0, (target - fromPos) / fromSpeed);

  engine.setPlaybackRate(toDeck, rate);
  engine.playAt(toDeck, mixIn, engine.getContext().currentTime + dtWall);
  ctx.updateDeck(toDeck, { isPlaying: true, currentTime: mixIn, speed: rate });
  return dtWall;
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
  const tempoRamp = ctx.plan.type === 'tempo-ramp';

  const savedFromLow = engine.getEQ(fromDeck, 'low');
  const savedFromMid = engine.getEQ(fromDeck, 'mid');
  const savedFromHigh = engine.getEQ(fromDeck, 'high');
  const savedToLow = engine.getEQ(toDeck, 'low');
  const savedToMid = engine.getEQ(toDeck, 'mid');
  const savedToHigh = engine.getEQ(toDeck, 'high');

  // Single idempotent teardown: restore both decks' EQs and leave the rates sane.
  // `withRate` is false when the caller already brought toDeck to toSpeed itself.
  let restored = false;
  const restore = (withRate: boolean): void => {
    if (restored) return;
    restored = true;
    engine.setEQ(fromDeck, 'low', savedFromLow, 0.25);
    engine.setEQ(fromDeck, 'mid', savedFromMid, 0.25);
    engine.setEQ(fromDeck, 'high', savedFromHigh, 0.25);
    engine.setEQ(toDeck, 'low', savedToLow, 0.25);
    engine.setEQ(toDeck, 'mid', savedToMid, 0.25);
    engine.setEQ(toDeck, 'high', savedToHigh, 0.25);
    if (withRate) {
      if (Math.abs(engine.getPlaybackRate(toDeck) - toSpeed) > 0.002) {
        engine.setPlaybackRate(toDeck, toSpeed, 2);
      }
      engine.setPlaybackRate(fromDeck, fromSpeed);
      ctx.updateDeck(toDeck, { speed: toSpeed });
    }
  };

  const fromSide = fromDeck === 'A' ? -1 : 1;
  const toSide = -fromSide;
  await parkCrossfader(ctx, signal, fromSide);
  if (signal.aborted) { restore(true); return; }

  // Incoming starts beat-aligned and tempo-matched, with its bass out of the
  // way and its mids/highs pulled back so it eases in rather than slamming in
  engine.setEQ(toDeck, 'low', -12);
  engine.setEQ(toDeck, 'mid', Math.max(-12, savedToMid - opts.inMidCut));
  engine.setEQ(toDeck, 'high', Math.max(-12, savedToHigh - opts.inHighCut));
  const dtWall = scheduleIncoming(ctx, rate, true);
  ctx.onProgress(86, 'Beatmatched...');

  // Hold the fade until the scheduled incoming deck actually sounds.
  await sleep(signal, dtWall);
  if (signal.aborted) { restore(true); return; }

  // For tempo-ramp the matched start rate glides to the incoming track's own
  // tempo across the fade; every other type holds a constant matched rate.
  const rate0 = rate;
  const baseRate = (t: number): number =>
    tempoRamp ? rate0 + (toSpeed - rate0) * smoothstep(t) : rate;

  // Tempo multiple the match chose (0.5/1/2): scales the incoming deck's beat
  // count so half/double-time blends compare like-for-like beats.
  const nominalMult = (fromTrack.bpm * fromSpeed) / (toTrack.bpm * rate);
  const syncMult = [0.5, 1, 2].reduce((a, b) =>
    Math.abs(Math.log(nominalMult / b)) < Math.abs(Math.log(nominalMult / a)) ? b : a);

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

    const target = baseRate(t);
    if (tempoRamp) {
      // Glide the outgoing deck with the incoming one so they stay matched while
      // the matched tempo bends toward the incoming track's own tempo.
      engine.setPlaybackRate(fromDeck, fromSpeed * target / rate0, TICK_S);
      engine.setPlaybackRate(toDeck, target, TICK_S);
    } else if (opts.tempoMatch) {
      // Phase-lock: ride the incoming pitch by up to ±0.4% to pull its beat grid
      // back into alignment with the outgoing deck's.
      const phaseErr = wrapPhase(
        continuousBeatAt(fromTrack, engine.getPlaybackPosition(fromDeck)) -
        continuousBeatAt(toTrack, engine.getPlaybackPosition(toDeck)) * syncMult
      );
      const correction = Math.max(-0.004, Math.min(0.004, 0.08 * phaseErr));
      engine.setPlaybackRate(toDeck, target * (1 + correction), TICK_S);
    }

    ctx.onProgress(Math.round(86 + t * 9), 'Blending...');
  });
  if (signal.aborted) { restore(true); return; }

  engine.stop(fromDeck);
  ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

  if (tempoRamp) {
    // The incoming deck has already glided to ~toSpeed; snap off any residual
    // sync correction and reset the stopped outgoing deck. No post-blend ease.
    engine.setPlaybackRate(toDeck, toSpeed);
    engine.setPlaybackRate(fromDeck, fromSpeed);
    restore(false);
    ctx.updateDeck(toDeck, { speed: toSpeed });
  } else if (Math.abs(engine.getPlaybackRate(toDeck) - toSpeed) > 0.002) {
    // Ease the new track back to its own tempo, slowly enough not to hear the
    // bend. Start from where phase-locking left the rate, not the nominal match.
    const from = engine.getPlaybackRate(toDeck);
    await ramp(signal, 12, (t) => {
      engine.setPlaybackRate(toDeck, from + (toSpeed - from) * smoothstep(t), TICK_S);
    });
    if (signal.aborted) { restore(true); return; }
    engine.setPlaybackRate(toDeck, toSpeed);
    engine.setPlaybackRate(fromDeck, fromSpeed);
    restore(false);
    ctx.updateDeck(toDeck, { speed: toSpeed });
  } else {
    // Within tolerance of toSpeed already — snap off any residual sync correction.
    engine.setPlaybackRate(toDeck, toSpeed);
    engine.setPlaybackRate(fromDeck, fromSpeed);
    restore(false);
    ctx.updateDeck(toDeck, { speed: toSpeed });
  }
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

  // The echo's wet path joins after the crossfader (effects bus), so its tail
  // rings out while the fader moves to the incoming deck. Delay time tracks
  // the audible tempo, not the file's nominal BPM.
  const echo = new EchoOut();
  echo.apply(engine.getDeckOutputNode(fromDeck), fromTrack.bpm * fromSpeed, engine.getContext(), engine.getEffectsBus());
  signal.addEventListener('abort', () => echo.remove(), { once: true });

  // Snappy cut: align to the next beat, not the next bar.
  const dtWall = scheduleIncoming(ctx, toSpeed, false);
  ctx.onProgress(88, 'Echo out...');

  // Start the fade exactly when the incoming deck sounds.
  await sleep(signal, dtWall);
  if (signal.aborted) return;

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
