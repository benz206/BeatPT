export interface DJEffect {
  // `output` is the mix bus the wet path feeds (AudioEngine.getEffectsBus()),
  // so effect tails pass through the master limiter and get recorded.
  apply(deckGainNode: GainNode, bpm: number, audioContext: AudioContext, output: AudioNode): void;
  remove(): void;
}

function beatDuration(bpm: number): number {
  return 60 / bpm;
}

export class EchoOut implements DJEffect {
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  apply(deckGainNode: GainNode, bpm: number, audioContext: AudioContext, output: AudioNode): void {
    const now = audioContext.currentTime;
    const delayTime = beatDuration(bpm) * 0.75;

    this.delay = audioContext.createDelay(4);
    this.delay.delayTime.value = delayTime;

    this.feedback = audioContext.createGain();
    this.feedback.gain.value = 0.4;

    this.wetGain = audioContext.createGain();
    this.wetGain.gain.setValueAtTime(0, now);
    this.wetGain.gain.linearRampToValueAtTime(0.6, now + 0.1);

    // Wet path: deckGainNode → wetGain → delay ⟳ feedback → output bus
    deckGainNode.connect(this.wetGain);
    this.wetGain.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(output);

    // Fade wet back out before removal
    this.wetGain.gain.setValueAtTime(0.6, now + 2.5);
    this.wetGain.gain.linearRampToValueAtTime(0, now + 3.5);

    this.removeTimer = setTimeout(() => this.remove(), 4000);
  }

  remove(): void {
    if (this.removeTimer) clearTimeout(this.removeTimer);
    try {
      this.wetGain?.disconnect();
      this.delay?.disconnect();
      this.feedback?.disconnect();
    } catch (_) {}
    this.delay = null;
    this.feedback = null;
    this.wetGain = null;
  }
}

// True insert: the deck signal is routed *through* the filter (via
// AudioEngine.insertDeckEffect) instead of adding a filtered copy on top.
export class FilterSweep {
  private filter: BiquadFilterNode | null = null;
  private restore: (() => void) | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  apply(insert: (node: AudioNode) => () => void, bpm: number, audioContext: AudioContext): void {
    const now = audioContext.currentTime;
    // 4 beats, capped below the scheduler's 3s filter cooldown so sweeps never overlap
    const duration = Math.min(2.8, Math.max(1.5, beatDuration(bpm) * 4));

    this.filter = audioContext.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 3;
    // Exponential ramps so the sweep moves at a constant musical rate
    this.filter.frequency.setValueAtTime(20000, now);
    this.filter.frequency.exponentialRampToValueAtTime(200, now + duration / 2);
    this.filter.frequency.exponentialRampToValueAtTime(20000, now + duration);

    this.restore = insert(this.filter);

    this.removeTimer = setTimeout(() => this.remove(), duration * 1000 + 100);
  }

  remove(): void {
    if (this.removeTimer) clearTimeout(this.removeTimer);
    this.restore?.();
    this.restore = null;
    this.filter = null;
  }
}

export type BassSwapSettings = {
  deckA: { low: number };
  deckB: { low: number };
};

// BassSwap returns EQ settings rather than owning audio nodes.
// The caller applies them via AudioEngine.setEQ and reverts after duration.
export function getBassSwapSettings(currentDeckALow: number, currentDeckBLow: number): BassSwapSettings {
  return {
    deckA: { low: Math.max(-12, currentDeckALow - 12) },
    deckB: { low: Math.min(12, currentDeckBLow + 8) },
  };
}

export class StutterEffect implements DJEffect {
  private gainNode: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private baseGain = 1;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  // Gate pattern is fully scheduled on the audio clock (sample-accurate,
  // no setInterval jitter). `startTime` lets the caller align it to a beat;
  // `baseGain` is the deck's fader level to gate against and restore to.
  apply(
    deckGainNode: GainNode,
    bpm: number,
    audioContext: AudioContext,
    _output: AudioNode,
    startTime?: number,
    baseGain?: number,
  ): void {
    this.gainNode = deckGainNode;
    this.ctx = audioContext;
    this.baseGain = baseGain ?? deckGainNode.gain.value;

    const now = audioContext.currentTime;
    const gate = beatDuration(bpm) / 4; // 1/16th-note gate
    const t0 = Math.max(now, startTime ?? now);
    const cycles = Math.max(1, Math.round(2 / (gate * 2))); // ~2s of gating

    const g = deckGainNode.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.baseGain, t0);
    for (let i = 0; i < cycles; i++) {
      const t = t0 + i * gate * 2;
      g.setValueAtTime(this.baseGain, t);
      g.linearRampToValueAtTime(0, t + 0.005);
      g.setValueAtTime(0, t + gate - 0.005);
      g.linearRampToValueAtTime(this.baseGain, t + gate);
    }
    g.setValueAtTime(this.baseGain, t0 + cycles * gate * 2);

    this.removeTimer = setTimeout(() => this.remove(), (t0 - now + cycles * gate * 2) * 1000 + 100);
  }

  remove(): void {
    if (this.removeTimer) clearTimeout(this.removeTimer);
    if (this.gainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(this.baseGain, now + 0.01);
    }
    this.gainNode = null;
    this.ctx = null;
    this.removeTimer = null;
  }
}

function createImpulseResponse(audioContext: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let energy = 0;
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      energy += data[i] * data[i];
    }
    // Normalize to unit energy so convolution adds no net gain — an
    // unnormalized noise IR of this length boosts the wet path by ~35 dB.
    const norm = 1 / Math.sqrt(energy || 1);
    for (let i = 0; i < length; i++) data[i] *= norm;
  }
  return impulse;
}

export class Reverb implements DJEffect {
  private convolver: ConvolverNode | null = null;
  private wetGain: GainNode | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  apply(deckGainNode: GainNode, _bpm: number, audioContext: AudioContext, output: AudioNode): void {
    const now = audioContext.currentTime;

    this.convolver = audioContext.createConvolver();
    this.convolver.buffer = createImpulseResponse(audioContext, 2.5, 3);

    this.wetGain = audioContext.createGain();
    this.wetGain.gain.setValueAtTime(0, now);
    this.wetGain.gain.linearRampToValueAtTime(0.6, now + 0.2);

    deckGainNode.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(output);

    this.wetGain.gain.setValueAtTime(0.6, now + 2.5);
    this.wetGain.gain.linearRampToValueAtTime(0, now + 3.5);

    this.removeTimer = setTimeout(() => this.remove(), 4000);
  }

  remove(): void {
    if (this.removeTimer) clearTimeout(this.removeTimer);
    try {
      this.convolver?.disconnect();
      this.wetGain?.disconnect();
    } catch (_) {}
    this.convolver = null;
    this.wetGain = null;
  }
}
