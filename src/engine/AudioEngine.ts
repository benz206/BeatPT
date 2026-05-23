type Deck = 'A' | 'B';
type EQBand = 'low' | 'mid' | 'high';

interface DeckState {
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  gainNode: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  analyser: AnalyserNode;
  isPlaying: boolean;
  startTime: number;
  pauseOffset: number;
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private ctx: AudioContext;
  private decks: Record<Deck, DeckState>;
  private crossfaderGainA: GainNode;
  private crossfaderGainB: GainNode;
  private masterLimiter: DynamicsCompressorNode;
  private crossfaderValue = 0;
  private playbackRates: Record<Deck, number> = { A: 1, B: 1 };
  private readonly RAMP_TIME = 0.01;

  private constructor() {
    this.ctx = new AudioContext();

    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -3;
    this.masterLimiter.knee.value = 0;
    this.masterLimiter.ratio.value = 20;
    this.masterLimiter.attack.value = 0.001;
    this.masterLimiter.release.value = 0.1;
    this.masterLimiter.connect(this.ctx.destination);

    this.crossfaderGainA = this.ctx.createGain();
    this.crossfaderGainB = this.ctx.createGain();
    this.crossfaderGainA.connect(this.masterLimiter);
    this.crossfaderGainB.connect(this.masterLimiter);

    this.decks = {
      A: this.createDeckState(this.crossfaderGainA),
      B: this.createDeckState(this.crossfaderGainB),
    };

    this.setCrossfader(0);
  }

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private createDeckState(destination: AudioNode): DeckState {
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 1;

    const eqLow = this.ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 250;

    const eqMid = this.ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.7;

    const eqHigh = this.ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 4000;

    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;

    gainNode.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(analyser);
    analyser.connect(destination);

    return {
      source: null,
      buffer: null,
      gainNode,
      eqLow,
      eqMid,
      eqHigh,
      analyser,
      isPlaying: false,
      startTime: 0,
      pauseOffset: 0,
    };
  }

  getContext(): AudioContext {
    return this.ctx;
  }

  async decodeAudioFile(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return this.ctx.decodeAudioData(arrayBuffer);
  }

  loadTrack(deck: Deck, audioBuffer: AudioBuffer): void {
    const state = this.decks[deck];
    if (state.isPlaying) {
      this.stop(deck);
    }
    state.buffer = audioBuffer;
    state.pauseOffset = 0;
    this.playbackRates[deck] = 1;
  }

  play(deck: Deck): void {
    const state = this.decks[deck];
    if (!state.buffer || state.isPlaying) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const source = this.ctx.createBufferSource();
    source.buffer = state.buffer;
    source.playbackRate.value = this.playbackRates[deck];
    source.connect(state.gainNode);
    source.start(0, state.pauseOffset);
    source.onended = () => {
      if (state.isPlaying) {
        state.isPlaying = false;
        state.pauseOffset = 0;
      }
    };

    state.source = source;
    state.startTime = this.ctx.currentTime;
    state.isPlaying = true;
  }

  pause(deck: Deck): void {
    const state = this.decks[deck];
    if (!state.isPlaying || !state.source) return;

    const elapsed = this.ctx.currentTime - state.startTime;
    state.pauseOffset = state.pauseOffset + elapsed * this.playbackRates[deck];
    state.source.onended = null;
    state.source.stop();
    state.source = null;
    state.isPlaying = false;
  }

  stop(deck: Deck): void {
    const state = this.decks[deck];
    if (!state.source) return;

    state.source.onended = null;
    try {
      state.source.stop();
    } catch (_) {
      // already stopped
    }
    state.source = null;
    state.isPlaying = false;
    state.pauseOffset = 0;
  }

  isPlaying(deck: Deck): boolean {
    return this.decks[deck].isPlaying;
  }

  seek(deck: Deck, position: number): void {
    const state = this.decks[deck];
    if (!state.buffer) return;

    const wasPlaying = state.isPlaying;

    if (state.source) {
      state.source.onended = null;
      state.source.stop();
      state.source = null;
    }

    state.pauseOffset = Math.max(0, Math.min(position, state.buffer.duration));
    state.isPlaying = false;

    if (wasPlaying) {
      this.play(deck);
    }
  }

  getPlaybackPosition(deck: Deck): number {
    const state = this.decks[deck];
    if (state.isPlaying) {
      const elapsed = this.ctx.currentTime - state.startTime;
      return state.pauseOffset + elapsed * this.playbackRates[deck];
    }
    return state.pauseOffset;
  }

  setPlaybackRate(deck: Deck, rate: number): void {
    this.playbackRates[deck] = rate;
    const state = this.decks[deck];
    if (state.source) {
      state.source.playbackRate.value = rate;
    }
  }

  setVolume(deck: Deck, value: number): void {
    const gain = this.decks[deck].gainNode.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(Math.max(0, Math.min(1, value)), now + this.RAMP_TIME);
  }

  setCrossfader(value: number): void {
    this.crossfaderValue = Math.max(-1, Math.min(1, value));
    const angle = ((this.crossfaderValue + 1) / 2) * (Math.PI / 2);
    const gainA = Math.cos(angle);
    const gainB = Math.sin(angle);

    const now = this.ctx.currentTime;
    this.crossfaderGainA.gain.cancelScheduledValues(now);
    this.crossfaderGainA.gain.setValueAtTime(this.crossfaderGainA.gain.value, now);
    this.crossfaderGainA.gain.linearRampToValueAtTime(gainA, now + this.RAMP_TIME);

    this.crossfaderGainB.gain.cancelScheduledValues(now);
    this.crossfaderGainB.gain.setValueAtTime(this.crossfaderGainB.gain.value, now);
    this.crossfaderGainB.gain.linearRampToValueAtTime(gainB, now + this.RAMP_TIME);
  }

  getCrossfaderValue(): number {
    return this.crossfaderValue;
  }

  setEQ(deck: Deck, band: EQBand, value: number): void {
    const state = this.decks[deck];
    const node = band === 'low' ? state.eqLow : band === 'mid' ? state.eqMid : state.eqHigh;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(Math.max(-12, Math.min(12, value)), now + this.RAMP_TIME);
  }

  getEQ(deck: Deck, band: EQBand): number {
    const state = this.decks[deck];
    const node = band === 'low' ? state.eqLow : band === 'mid' ? state.eqMid : state.eqHigh;
    return node.gain.value;
  }

  getAnalyserNode(deck: Deck): AnalyserNode {
    return this.decks[deck].analyser;
  }

  getDeckOutputNode(deck: Deck): GainNode {
    return this.decks[deck].gainNode;
  }
}
