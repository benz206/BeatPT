export interface DJEffect {
  apply(deckGainNode: GainNode, bpm: number, audioContext: AudioContext): void;
  remove(): void;
}

function beatDuration(bpm: number): number {
  return 60 / bpm;
}

export class EchoOut implements DJEffect {
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  apply(deckGainNode: GainNode, bpm: number, audioContext: AudioContext): void {
    this.ctx = audioContext;
    const now = audioContext.currentTime;
    const delayTime = beatDuration(bpm) * 0.75;

    this.delay = audioContext.createDelay(4);
    this.delay.delayTime.value = delayTime;

    this.feedback = audioContext.createGain();
    this.feedback.gain.value = 0.4;

    this.wetGain = audioContext.createGain();
    this.wetGain.gain.setValueAtTime(0, now);
    this.wetGain.gain.linearRampToValueAtTime(0.8, now + 0.1);

    this.dryGain = audioContext.createGain();
    this.dryGain.gain.setValueAtTime(1, now);

    deckGainNode.connect(this.dryGain);
    deckGainNode.connect(this.wetGain);
    this.wetGain.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(deckGainNode.context.destination);

    // Fade out dry signal so the echo carries the track away
    this.dryGain.gain.setValueAtTime(1, now + 0.5);
    this.dryGain.gain.linearRampToValueAtTime(0, now + 2.5);

    this.removeTimer = setTimeout(() => this.remove(), 3500);
  }

  remove(): void {
    if (this.removeTimer) clearTimeout(this.removeTimer);
    try {
      this.wetGain?.disconnect();
      this.delay?.disconnect();
      this.feedback?.disconnect();
      this.dryGain?.disconnect();
    } catch (_) {}
    this.delay = null;
    this.feedback = null;
    this.wetGain = null;
    this.dryGain = null;
    this.ctx = null;
  }
}

export class FilterSweep implements DJEffect {
  private filter: BiquadFilterNode | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  apply(deckGainNode: GainNode, _bpm: number, audioContext: AudioContext): void {
    const now = audioContext.currentTime;
    const duration = 2;

    this.filter = audioContext.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 8;
    this.filter.frequency.setValueAtTime(20000, now);
    this.filter.frequency.linearRampToValueAtTime(200, now + duration / 2);
    this.filter.frequency.linearRampToValueAtTime(20000, now + duration);

    deckGainNode.connect(this.filter);
    this.filter.connect(audioContext.destination);

    this.removeTimer = setTimeout(() => this.remove(), duration * 1000 + 100);
  }

  remove(): void {
    if (this.removeTimer) clearTimeout(this.removeTimer);
    try {
      this.filter?.disconnect();
    } catch (_) {}
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
  private stutterInterval: ReturnType<typeof setInterval> | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;
  private gainNode: GainNode | null = null;
  private ctx: AudioContext | null = null;

  apply(deckGainNode: GainNode, bpm: number, audioContext: AudioContext): void {
    this.gainNode = deckGainNode;
    this.ctx = audioContext;

    const stutterRate = beatDuration(bpm) / 4;
    let toggled = false;

    this.stutterInterval = setInterval(() => {
      if (!this.ctx || !this.gainNode) return;
      const now = this.ctx.currentTime;
      const targetGain = toggled ? 1 : 0;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.005);
      toggled = !toggled;
    }, stutterRate * 1000);

    this.removeTimer = setTimeout(() => this.remove(), 2000);
  }

  remove(): void {
    if (this.stutterInterval) clearInterval(this.stutterInterval);
    if (this.removeTimer) clearTimeout(this.removeTimer);
    if (this.gainNode && this.ctx) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(1, now + 0.01);
    }
    this.gainNode = null;
    this.ctx = null;
    this.stutterInterval = null;
    this.removeTimer = null;
  }
}

function createImpulseResponse(audioContext: AudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = audioContext.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

export class Reverb implements DJEffect {
  private convolver: ConvolverNode | null = null;
  private wetGain: GainNode | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  apply(deckGainNode: GainNode, _bpm: number, audioContext: AudioContext): void {
    const now = audioContext.currentTime;

    this.convolver = audioContext.createConvolver();
    this.convolver.buffer = createImpulseResponse(audioContext, 2.5, 3);

    this.wetGain = audioContext.createGain();
    this.wetGain.gain.setValueAtTime(0, now);
    this.wetGain.gain.linearRampToValueAtTime(0.6, now + 0.2);

    deckGainNode.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(audioContext.destination);

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
