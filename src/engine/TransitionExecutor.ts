import { AudioEngine } from './AudioEngine';
import { TransitionPlan } from './TransitionStrategy';
import { EchoOut } from './Effects';

export interface TransitionContext {
  engine: AudioEngine;
  fromDeck: 'A' | 'B';
  toDeck: 'A' | 'B';
  fromTrack: { bpm: number; duration: number };
  toTrack: { bpm: number };
  fromSpeed: number;
  toSpeed: number;
  plan: TransitionPlan;
  onComplete: () => void;
  onProgress: (confidence: number, message: string) => void;
  setCrossfaderPosition: (pos: number) => void;
  updateDeck: (deck: 'A' | 'B', updates: { isPlaying?: boolean; currentTime?: number }) => void;
}

function managedInterval(signal: AbortSignal, fn: (stop: () => void) => void, ms: number): void {
  const id = setInterval(() => fn(() => clearInterval(id)), ms);
  signal.addEventListener('abort', () => clearInterval(id), { once: true });
}

function managedTimeout(signal: AbortSignal, fn: () => void, ms: number): void {
  const id = setTimeout(fn, ms);
  signal.addEventListener('abort', () => clearTimeout(id), { once: true });
}

export function executeTransition(ctx: TransitionContext): AbortController {
  const controller = new AbortController();

  switch (ctx.plan.type) {
    case 'long-blend':
      executeLongBlend(ctx, controller.signal);
      break;
    case 'tempo-ramp':
      executeTempoRamp(ctx, controller.signal);
      break;
    case 'filter-sweep':
      executeFilterSweep(ctx, controller.signal);
      break;
    case 'echo-drop':
      executeEchoDrop(ctx, controller.signal);
      break;
    case 'breakdown-bridge':
      executeBreakdownBridge(ctx, controller.signal);
      break;
  }

  return controller;
}

function executeLongBlend(ctx: TransitionContext, signal: AbortSignal): void {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed, toSpeed } = ctx;

  const matchRate = fromTrack.bpm * fromSpeed / toTrack.bpm;
  engine.setPlaybackRate(toDeck, matchRate);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true });

  const savedFromLow = engine.getEQ(fromDeck, 'low');
  const startValue = engine.getCrossfaderValue();
  const targetValue = toDeck === 'B' ? 1 : -1;

  let step = 0;
  const totalSteps = 100;

  managedInterval(signal, (stop) => {
    if (signal.aborted) return;
    step++;
    const t = step / totalSteps;
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const pos = startValue + (targetValue - startValue) * eased;
    engine.setCrossfader(pos);
    ctx.setCrossfaderPosition(pos);

    if (step === 50) {
      engine.setEQ(fromDeck, 'low', -12);
    }

    ctx.onProgress(Math.round(85 + t * 10), 'Blending...');

    if (step >= totalSteps) {
      stop();
      engine.setEQ(fromDeck, 'low', savedFromLow);
      engine.stop(fromDeck);
      ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

      let restoreStep = 0;
      const restoreSteps = 20;
      managedInterval(signal, (stopRestore) => {
        if (signal.aborted) return;
        restoreStep++;
        const rt = restoreStep / restoreSteps;
        const easeR = rt * rt * (3 - 2 * rt);
        engine.setPlaybackRate(toDeck, matchRate + (toSpeed - matchRate) * easeR);

        if (restoreStep >= restoreSteps) {
          stopRestore();
          ctx.onComplete();
        }
      }, 200);
    }
  }, 200);
}

function executeTempoRamp(ctx: TransitionContext, signal: AbortSignal): void {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed, toSpeed } = ctx;

  const matchRate = fromTrack.bpm * fromSpeed / toTrack.bpm;
  engine.setPlaybackRate(toDeck, toSpeed);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true });

  let phase1Step = 0;
  const phase1Steps = 25;

  managedInterval(signal, (stopPhase1) => {
    if (signal.aborted) return;
    phase1Step++;
    const t = phase1Step / phase1Steps;
    const eased = t * t * (3 - 2 * t);
    engine.setPlaybackRate(toDeck, toSpeed + (matchRate - toSpeed) * eased);
    ctx.onProgress(Math.round(85 + t * 5), 'Syncing BPM...');

    if (phase1Step >= phase1Steps) {
      stopPhase1();
      const startValue = engine.getCrossfaderValue();
      const targetValue = toDeck === 'B' ? 1 : -1;
      let phase2Step = 0;
      const phase2Steps = 80;

      managedInterval(signal, (stopPhase2) => {
        if (signal.aborted) return;
        phase2Step++;
        const t2 = phase2Step / phase2Steps;
        const eased2 = t2 < 0.5 ? 2 * t2 * t2 : -1 + (4 - 2 * t2) * t2;
        const pos = startValue + (targetValue - startValue) * eased2;
        engine.setCrossfader(pos);
        ctx.setCrossfaderPosition(pos);
        ctx.onProgress(Math.round(90 + t2 * 5), 'Crossfading...');

        if (phase2Step >= phase2Steps) {
          stopPhase2();
          engine.stop(fromDeck);
          ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

          let phase3Step = 0;
          const phase3Steps = 25;

          managedInterval(signal, (stopPhase3) => {
            if (signal.aborted) return;
            phase3Step++;
            const t3 = phase3Step / phase3Steps;
            const eased3 = t3 * t3 * (3 - 2 * t3);
            engine.setPlaybackRate(toDeck, matchRate + (toSpeed - matchRate) * eased3);

            if (phase3Step >= phase3Steps) {
              stopPhase3();
              ctx.onComplete();
            }
          }, 200);
        }
      }, 200);
    }
  }, 200);
}

function executeFilterSweep(ctx: TransitionContext, signal: AbortSignal): void {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed, toSpeed } = ctx;

  const matchRate = fromTrack.bpm * fromSpeed / toTrack.bpm;
  engine.setPlaybackRate(toDeck, matchRate);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true });

  const savedFromLow = engine.getEQ(fromDeck, 'low');
  const savedFromMid = engine.getEQ(fromDeck, 'mid');
  const savedFromHigh = engine.getEQ(fromDeck, 'high');
  const savedToHigh = engine.getEQ(toDeck, 'high');

  engine.setEQ(toDeck, 'high', -12);

  const startValue = engine.getCrossfaderValue();
  const targetValue = toDeck === 'B' ? 1 : -1;

  let phase1Step = 0;
  const phase1Steps = 50;

  managedInterval(signal, (stopPhase1) => {
    if (signal.aborted) return;
    phase1Step++;
    const t = phase1Step / phase1Steps;
    engine.setEQ(fromDeck, 'low', savedFromLow + (-12 - savedFromLow) * t);
    engine.setEQ(fromDeck, 'mid', savedFromMid + (-12 - savedFromMid) * t);
    engine.setEQ(toDeck, 'high', -12 + (savedToHigh - (-12)) * t);
    const pos = startValue + (targetValue - startValue) * t * 0.5;
    engine.setCrossfader(pos);
    ctx.setCrossfaderPosition(pos);
    ctx.onProgress(Math.round(85 + t * 5), 'Sweeping...');

    if (phase1Step >= phase1Steps) {
      stopPhase1();
      const phase2Start = startValue + (targetValue - startValue) * 0.5;
      let phase2Step = 0;
      const phase2Steps = 40;

      managedInterval(signal, (stopPhase2) => {
        if (signal.aborted) return;
        phase2Step++;
        const t2 = phase2Step / phase2Steps;
        const pos2 = phase2Start + (targetValue - phase2Start) * t2;
        engine.setCrossfader(pos2);
        ctx.setCrossfaderPosition(pos2);
        ctx.onProgress(Math.round(90 + t2 * 5), 'Fading in...');

        if (phase2Step >= phase2Steps) {
          stopPhase2();
          engine.setEQ(fromDeck, 'low', savedFromLow);
          engine.setEQ(fromDeck, 'mid', savedFromMid);
          engine.setEQ(fromDeck, 'high', savedFromHigh);
          engine.stop(fromDeck);
          ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

          let phase3Step = 0;
          const phase3Steps = 10;

          managedInterval(signal, (stopPhase3) => {
            if (signal.aborted) return;
            phase3Step++;
            const t3 = phase3Step / phase3Steps;
            engine.setPlaybackRate(toDeck, matchRate + (toSpeed - matchRate) * t3);

            if (phase3Step >= phase3Steps) {
              stopPhase3();
              ctx.onComplete();
            }
          }, 200);
        }
      }, 200);
    }
  }, 200);
}

function executeEchoDrop(ctx: TransitionContext, signal: AbortSignal): void {
  const { engine, fromDeck, toDeck, fromTrack, toSpeed } = ctx;

  const echo = new EchoOut();
  echo.apply(engine.getDeckOutputNode(fromDeck), fromTrack.bpm, engine.getContext());
  signal.addEventListener('abort', () => echo.remove(), { once: true });

  const gainNode = engine.getDeckOutputNode(fromDeck);
  const audioCtx = engine.getContext();
  const now = audioCtx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(0, now + 3);

  const startTime = Date.now();
  managedInterval(signal, (stopProgress) => {
    if (signal.aborted) return;
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= 3.5) {
      stopProgress();
      return;
    }
    ctx.onProgress(Math.round(85 + (Math.min(elapsed, 3) / 3) * 10), 'Echo out...');
  }, 200);

  managedTimeout(signal, () => {
    if (signal.aborted) return;
    engine.stop(fromDeck);
    const now2 = audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(now2);
    gainNode.gain.setValueAtTime(1, now2);
    ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

    engine.setPlaybackRate(toDeck, toSpeed);
    engine.play(toDeck);
    ctx.updateDeck(toDeck, { isPlaying: true });

    const targetValue = toDeck === 'B' ? 1 : -1;
    engine.setCrossfader(targetValue);
    ctx.setCrossfaderPosition(targetValue);
    ctx.onProgress(95, 'Drop!');
  }, 4000);

  managedTimeout(signal, () => {
    if (signal.aborted) return;
    ctx.onComplete();
  }, 8000);
}

function executeBreakdownBridge(ctx: TransitionContext, signal: AbortSignal): void {
  const { engine, fromDeck, toDeck, toSpeed } = ctx;

  const savedFromLow = engine.getEQ(fromDeck, 'low');
  const savedFromMid = engine.getEQ(fromDeck, 'mid');
  const savedFromHigh = engine.getEQ(fromDeck, 'high');

  let phase1Step = 0;
  const phase1Steps = 30;

  managedInterval(signal, (stopPhase1) => {
    if (signal.aborted) return;
    phase1Step++;
    if (phase1Step > phase1Steps) { stopPhase1(); return; }
    const t = phase1Step / phase1Steps;
    engine.setEQ(fromDeck, 'low', savedFromLow + (-12 - savedFromLow) * t);
    engine.setEQ(fromDeck, 'mid', savedFromMid + (-8 - savedFromMid) * t);
    engine.setEQ(fromDeck, 'high', savedFromHigh + (-6 - savedFromHigh) * t);
    ctx.onProgress(Math.round(85 + t * 3), 'Breaking down...');
  }, 200);

  managedTimeout(signal, () => {
    if (signal.aborted) return;
    engine.setPlaybackRate(toDeck, toSpeed);
    engine.play(toDeck);
    ctx.updateDeck(toDeck, { isPlaying: true });

    const startValue = engine.getCrossfaderValue();
    const targetValue = toDeck === 'B' ? 1 : -1;
    let phase2Step = 0;
    const phase2Steps = 50;

    managedInterval(signal, (stopPhase2) => {
      if (signal.aborted) return;
      phase2Step++;
      const t = phase2Step / phase2Steps;
      const eased = t * t;
      const pos = startValue + (targetValue - startValue) * eased;
      engine.setCrossfader(pos);
      ctx.setCrossfaderPosition(pos);
      ctx.onProgress(Math.round(88 + t * 7), 'Bridging...');

      if (phase2Step >= phase2Steps) {
        stopPhase2();
        engine.setEQ(fromDeck, 'low', savedFromLow);
        engine.setEQ(fromDeck, 'mid', savedFromMid);
        engine.setEQ(fromDeck, 'high', savedFromHigh);
        engine.stop(fromDeck);
        ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });
      }
    }, 200);
  }, 4000);

  managedTimeout(signal, () => {
    if (signal.aborted) return;
    ctx.onComplete();
  }, 16000);
}
