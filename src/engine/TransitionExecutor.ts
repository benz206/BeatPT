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
  engine.setPlaybackRate(toDeck, toSpeed);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true });

  // Phase 1: speed sync (5s) — same as tempo-ramp
  let syncStep = 0;
  const syncSteps = 25;

  managedInterval(signal, (stopSync) => {
    if (signal.aborted) return;
    syncStep++;
    const t = syncStep / syncSteps;
    const eased = t * t * (3 - 2 * t);
    engine.setPlaybackRate(toDeck, toSpeed + (matchRate - toSpeed) * eased);
    ctx.onProgress(Math.round(85 + t * 5), 'Syncing...');

    if (syncStep >= syncSteps) {
      stopSync();

      // Phase 2: crossfade (16s) with gentle bass crossover
      const savedFromLow = engine.getEQ(fromDeck, 'low');
      const startValue = engine.getCrossfaderValue();
      const targetValue = toDeck === 'B' ? 1 : -1;
      let fadeStep = 0;
      const fadeSteps = 80;

      managedInterval(signal, (stopFade) => {
        if (signal.aborted) return;
        fadeStep++;
        const t2 = fadeStep / fadeSteps;
        const eased2 = t2 < 0.5 ? 2 * t2 * t2 : -1 + (4 - 2 * t2) * t2;
        const pos = startValue + (targetValue - startValue) * eased2;
        engine.setCrossfader(pos);
        ctx.setCrossfaderPosition(pos);

        // Gradual bass reduction on outgoing in the middle third (steps 27-53)
        if (fadeStep >= 27 && fadeStep <= 53) {
          const bassT = (fadeStep - 27) / 26;
          const bassReduce = bassT * 6;
          engine.setEQ(fromDeck, 'low', savedFromLow - bassReduce);
        }

        ctx.onProgress(Math.round(90 + t2 * 5), 'Blending...');

        if (fadeStep >= fadeSteps) {
          stopFade();
          engine.setEQ(fromDeck, 'low', savedFromLow);
          engine.stop(fromDeck);
          ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

          // Phase 3: speed restore (5s)
          let restoreStep = 0;
          const restoreSteps = 25;
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
  engine.setPlaybackRate(toDeck, toSpeed);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true });

  const savedFromLow = engine.getEQ(fromDeck, 'low');
  const savedFromMid = engine.getEQ(fromDeck, 'mid');
  const savedToHigh = engine.getEQ(toDeck, 'high');

  engine.setEQ(toDeck, 'high', -6);

  const startValue = engine.getCrossfaderValue();
  const targetValue = toDeck === 'B' ? 1 : -1;

  // Phase 1: speed sync + EQ sweep (5s)
  let syncStep = 0;
  const syncSteps = 25;

  managedInterval(signal, (stopSync) => {
    if (signal.aborted) return;
    syncStep++;
    const t = syncStep / syncSteps;
    const eased = t * t * (3 - 2 * t);
    engine.setPlaybackRate(toDeck, toSpeed + (matchRate - toSpeed) * eased);
    engine.setEQ(fromDeck, 'low', savedFromLow - t * 6);
    engine.setEQ(toDeck, 'high', -6 + (savedToHigh + 6) * t);
    ctx.onProgress(Math.round(85 + t * 5), 'Sweeping...');

    if (syncStep >= syncSteps) {
      stopSync();

      // Phase 2: crossfade with continued EQ sweep (16s)
      let fadeStep = 0;
      const fadeSteps = 80;

      managedInterval(signal, (stopFade) => {
        if (signal.aborted) return;
        fadeStep++;
        const t2 = fadeStep / fadeSteps;
        const eased2 = t2 < 0.5 ? 2 * t2 * t2 : -1 + (4 - 2 * t2) * t2;
        const pos = startValue + (targetValue - startValue) * eased2;
        engine.setCrossfader(pos);
        ctx.setCrossfaderPosition(pos);

        // Gradually thin outgoing mid in second half of crossfade
        if (t2 > 0.5) {
          const midT = (t2 - 0.5) * 2;
          engine.setEQ(fromDeck, 'mid', savedFromMid - midT * 6);
        }

        ctx.onProgress(Math.round(90 + t2 * 5), 'Fading in...');

        if (fadeStep >= fadeSteps) {
          stopFade();
          engine.setEQ(fromDeck, 'low', savedFromLow);
          engine.setEQ(fromDeck, 'mid', savedFromMid);
          engine.stop(fromDeck);
          ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

          // Phase 3: speed restore (5s)
          let restoreStep = 0;
          const restoreSteps = 25;
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
  }, 200);
}

// Long blend with echo/reverb tail layered on the outgoing deck during crossfade
function executeEchoDrop(ctx: TransitionContext, signal: AbortSignal): void {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed, toSpeed } = ctx;

  const matchRate = fromTrack.bpm * fromSpeed / toTrack.bpm;
  engine.setPlaybackRate(toDeck, toSpeed);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true });

  // Phase 1: speed sync (5s)
  let syncStep = 0;
  const syncSteps = 25;

  managedInterval(signal, (stopSync) => {
    if (signal.aborted) return;
    syncStep++;
    const t = syncStep / syncSteps;
    const eased = t * t * (3 - 2 * t);
    engine.setPlaybackRate(toDeck, toSpeed + (matchRate - toSpeed) * eased);
    ctx.onProgress(Math.round(85 + t * 5), 'Syncing...');

    if (syncStep >= syncSteps) {
      stopSync();

      // Apply echo on outgoing as the crossfade begins
      const echo = new EchoOut();
      echo.apply(engine.getDeckOutputNode(fromDeck), fromTrack.bpm, engine.getContext());
      signal.addEventListener('abort', () => echo.remove(), { once: true });

      // Phase 2: crossfade (16s)
      const startValue = engine.getCrossfaderValue();
      const targetValue = toDeck === 'B' ? 1 : -1;
      let fadeStep = 0;
      const fadeSteps = 80;

      managedInterval(signal, (stopFade) => {
        if (signal.aborted) return;
        fadeStep++;
        const t2 = fadeStep / fadeSteps;
        const eased2 = t2 < 0.5 ? 2 * t2 * t2 : -1 + (4 - 2 * t2) * t2;
        const pos = startValue + (targetValue - startValue) * eased2;
        engine.setCrossfader(pos);
        ctx.setCrossfaderPosition(pos);

        // Re-trigger echo halfway through to keep the tail going
        if (fadeStep === 40) {
          const echo2 = new EchoOut();
          echo2.apply(engine.getDeckOutputNode(fromDeck), fromTrack.bpm, engine.getContext());
          signal.addEventListener('abort', () => echo2.remove(), { once: true });
        }

        ctx.onProgress(Math.round(90 + t2 * 5), 'Echo blend...');

        if (fadeStep >= fadeSteps) {
          stopFade();
          engine.stop(fromDeck);
          ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

          // Phase 3: speed restore (5s)
          let restoreStep = 0;
          const restoreSteps = 25;
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
  }, 200);
}

// Long blend with gradual EQ drain on all bands of the outgoing deck
function executeBreakdownBridge(ctx: TransitionContext, signal: AbortSignal): void {
  const { engine, fromDeck, toDeck, fromTrack, toTrack, fromSpeed, toSpeed } = ctx;

  const matchRate = fromTrack.bpm * fromSpeed / toTrack.bpm;
  engine.setPlaybackRate(toDeck, toSpeed);
  engine.play(toDeck);
  ctx.updateDeck(toDeck, { isPlaying: true });

  // Phase 1: speed sync (5s)
  let syncStep = 0;
  const syncSteps = 25;

  managedInterval(signal, (stopSync) => {
    if (signal.aborted) return;
    syncStep++;
    const t = syncStep / syncSteps;
    const eased = t * t * (3 - 2 * t);
    engine.setPlaybackRate(toDeck, toSpeed + (matchRate - toSpeed) * eased);
    ctx.onProgress(Math.round(85 + t * 5), 'Syncing...');

    if (syncStep >= syncSteps) {
      stopSync();

      // Phase 2: crossfade (16s) with progressive EQ drain on outgoing
      const savedFromLow = engine.getEQ(fromDeck, 'low');
      const savedFromMid = engine.getEQ(fromDeck, 'mid');
      const savedFromHigh = engine.getEQ(fromDeck, 'high');
      const startValue = engine.getCrossfaderValue();
      const targetValue = toDeck === 'B' ? 1 : -1;
      let fadeStep = 0;
      const fadeSteps = 80;

      managedInterval(signal, (stopFade) => {
        if (signal.aborted) return;
        fadeStep++;
        const t2 = fadeStep / fadeSteps;
        const eased2 = t2 < 0.5 ? 2 * t2 * t2 : -1 + (4 - 2 * t2) * t2;
        const pos = startValue + (targetValue - startValue) * eased2;
        engine.setCrossfader(pos);
        ctx.setCrossfaderPosition(pos);

        // Progressive EQ drain: bass first, then mids, then highs
        if (t2 < 0.4) {
          engine.setEQ(fromDeck, 'low', savedFromLow - (t2 / 0.4) * 8);
        } else {
          engine.setEQ(fromDeck, 'low', savedFromLow - 8);
          const midT = Math.min((t2 - 0.4) / 0.3, 1);
          engine.setEQ(fromDeck, 'mid', savedFromMid - midT * 6);
          if (t2 > 0.7) {
            const highT = (t2 - 0.7) / 0.3;
            engine.setEQ(fromDeck, 'high', savedFromHigh - highT * 4);
          }
        }

        ctx.onProgress(Math.round(90 + t2 * 5), 'Bridging...');

        if (fadeStep >= fadeSteps) {
          stopFade();
          engine.setEQ(fromDeck, 'low', savedFromLow);
          engine.setEQ(fromDeck, 'mid', savedFromMid);
          engine.setEQ(fromDeck, 'high', savedFromHigh);
          engine.stop(fromDeck);
          ctx.updateDeck(fromDeck, { isPlaying: false, currentTime: 0 });

          // Phase 3: speed restore (5s)
          let restoreStep = 0;
          const restoreSteps = 25;
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
  }, 200);
}
