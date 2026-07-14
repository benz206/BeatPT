import keylockProcessorUrl from './keylockProcessor.js?url';

type Deck = 'A' | 'B';
type EQBand = 'low' | 'mid' | 'high';

interface DeckState {
  source: AudioBufferSourceNode | null;
  buffer: AudioBuffer | null;
  trimGain: GainNode;
  gainNode: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  analyser: AnalyserNode;
  keylock: AudioWorkletNode | null;
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
  private masterGain: GainNode;
  private masterLimiter: DynamicsCompressorNode;
  private crossfaderValue = 0;
  private playbackRates: Record<Deck, number> = { A: 1, B: 1 };
  private loops: Record<Deck, { start: number; end: number } | null> = { A: null, B: null };
  private recorder: MediaRecorder | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private recordChunks: Blob[] = [];
  private readonly RAMP_TIME = 0.01;

  private constructor() {
    this.ctx = new AudioContext();

    // Soft-knee limiting: hard 20:1 at -3 dB pumped audibly whenever two decks
    // overlapped mid-blend, so trade a little ceiling for transparency.
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -2;
    this.masterLimiter.knee.value = 4;
    this.masterLimiter.ratio.value = 12;
    this.masterLimiter.attack.value = 0.002;
    this.masterLimiter.release.value = 0.25;
    this.masterLimiter.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.masterLimiter);

    this.crossfaderGainA = this.ctx.createGain();
    this.crossfaderGainB = this.ctx.createGain();
    this.crossfaderGainA.connect(this.masterGain);
    this.crossfaderGainB.connect(this.masterGain);

    this.decks = {
      A: this.createDeckState(this.crossfaderGainA),
      B: this.createDeckState(this.crossfaderGainB),
    };

    this.setCrossfader(0);

    // Key lock: pitch-compensates varispeed so tempo changes don't shift pitch.
    // If the worklet can't load, decks keep the direct trim→gain path (plain varispeed).
    void this.initKeylock();
  }

  private async initKeylock(): Promise<void> {
    try {
      await this.ctx.audioWorklet.addModule(keylockProcessorUrl);
    } catch (_) {
      return;
    }
    for (const deck of ['A', 'B'] as const) {
      const state = this.decks[deck];
      const node = new AudioWorkletNode(this.ctx, 'keylock', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
      });
      state.trimGain.disconnect(state.gainNode);
      state.trimGain.connect(node);
      node.connect(state.gainNode);
      state.keylock = node;
      node.port.postMessage({ rate: this.playbackRates[deck], rampTime: 0 });
    }
  }

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private createDeckState(destination: AudioNode): DeckState {
    const trimGain = this.ctx.createGain();
    trimGain.gain.value = 1;

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

    trimGain.connect(gainNode);
    gainNode.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(analyser);
    analyser.connect(destination);

    return {
      source: null,
      buffer: null,
      trimGain,
      gainNode,
      eqLow,
      eqMid,
      eqHigh,
      analyser,
      keylock: null,
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

  loadTrack(deck: Deck, audioBuffer: AudioBuffer, trim = 1): void {
    const state = this.decks[deck];
    if (state.isPlaying) {
      this.stop(deck);
    }
    state.buffer = audioBuffer;
    state.pauseOffset = 0;
    state.trimGain.gain.value = Math.max(0, Math.min(2, trim));
    this.playbackRates[deck] = 1;
    this.loops[deck] = null;
    state.keylock?.port.postMessage({ rate: 1, rampTime: 0 });
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
    const loop = this.loops[deck];
    if (loop) {
      source.loop = true;
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
    }
    source.connect(state.trimGain);
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

  playAt(deck: Deck, offset: number, when: number): void {
    const state = this.decks[deck];
    if (!state.buffer) return;

    if (state.source) {
      state.source.onended = null;
      try {
        state.source.stop();
      } catch (_) {
        // already stopped
      }
      state.source = null;
      state.isPlaying = false;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const clampedOffset = Math.max(0, Math.min(offset, state.buffer.duration));
    const startAt = Math.max(when, this.ctx.currentTime);

    const source = this.ctx.createBufferSource();
    source.buffer = state.buffer;
    source.playbackRate.value = this.playbackRates[deck];
    const loop = this.loops[deck];
    if (loop) {
      source.loop = true;
      source.loopStart = loop.start;
      source.loopEnd = loop.end;
    }
    source.connect(state.trimGain);
    source.start(startAt, clampedOffset);
    source.onended = () => {
      if (state.isPlaying) {
        state.isPlaying = false;
        state.pauseOffset = 0;
      }
    };

    state.source = source;
    state.pauseOffset = clampedOffset;
    state.startTime = startAt;
    state.isPlaying = true;
  }

  pause(deck: Deck): void {
    const state = this.decks[deck];
    if (!state.isPlaying || !state.source) return;

    state.pauseOffset = this.getPlaybackPosition(deck);
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

    const loop = this.loops[deck];
    if (loop && (position < loop.start || position > loop.end)) {
      this.loops[deck] = null;
    }

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
    let pos = state.pauseOffset;
    if (state.isPlaying) {
      const elapsed = Math.max(0, this.ctx.currentTime - state.startTime);
      pos += elapsed * this.playbackRates[deck];
    }
    const loop = this.loops[deck];
    if (loop && loop.end > loop.start && pos > loop.end) {
      pos = loop.start + ((pos - loop.start) % (loop.end - loop.start));
    }
    return pos;
  }

  getPlaybackRate(deck: Deck): number {
    return this.playbackRates[deck];
  }

  setPlaybackRate(deck: Deck, rate: number, rampTime = 0): void {
    const state = this.decks[deck];
    if (state.isPlaying && state.source) {
      // Rebase timing so position tracking stays correct across rate changes
      state.pauseOffset = this.getPlaybackPosition(deck);
      state.startTime = this.ctx.currentTime;
    }
    this.playbackRates[deck] = rate;
    if (state.source) {
      const param = state.source.playbackRate;
      if (rampTime > 0) {
        const now = this.ctx.currentTime;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(rate, now + rampTime);
      } else {
        param.value = rate;
      }
    }
    state.keylock?.port.postMessage({ rate, rampTime });
  }

  setLoop(deck: Deck, start: number, end: number): void {
    const state = this.decks[deck];
    if (!state.buffer || end <= start) return;

    if (state.isPlaying && state.source) {
      // Rebase so the modulo fold in getPlaybackPosition starts from a clean offset
      state.pauseOffset = this.getPlaybackPosition(deck);
      state.startTime = this.ctx.currentTime;
    }

    this.loops[deck] = { start, end };
    if (state.source) {
      state.source.loopStart = start;
      state.source.loopEnd = end;
      state.source.loop = true;
    }
  }

  clearLoop(deck: Deck): void {
    const state = this.decks[deck];
    if (this.loops[deck] && state.isPlaying && state.source) {
      // Rebase to the folded position so tracking stays continuous after release
      state.pauseOffset = this.getPlaybackPosition(deck);
      state.startTime = this.ctx.currentTime;
    }
    this.loops[deck] = null;
    if (state.source) {
      state.source.loop = false;
    }
  }

  getLoop(deck: Deck): { start: number; end: number } | null {
    return this.loops[deck];
  }

  setTrimGain(deck: Deck, value: number): void {
    const gain = this.decks[deck].trimGain.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(Math.max(0, Math.min(2, value)), now + this.RAMP_TIME);
  }

  setVolume(deck: Deck, value: number): void {
    const gain = this.decks[deck].gainNode.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(Math.max(0, Math.min(1, value)), now + this.RAMP_TIME);
  }

  setCrossfader(value: number, rampTime = this.RAMP_TIME): void {
    this.crossfaderValue = Math.max(-1, Math.min(1, value));
    const angle = ((this.crossfaderValue + 1) / 2) * (Math.PI / 2);
    const gainA = Math.cos(angle);
    const gainB = Math.sin(angle);

    const now = this.ctx.currentTime;
    this.crossfaderGainA.gain.cancelScheduledValues(now);
    this.crossfaderGainA.gain.setValueAtTime(this.crossfaderGainA.gain.value, now);
    this.crossfaderGainA.gain.linearRampToValueAtTime(gainA, now + rampTime);

    this.crossfaderGainB.gain.cancelScheduledValues(now);
    this.crossfaderGainB.gain.setValueAtTime(this.crossfaderGainB.gain.value, now);
    this.crossfaderGainB.gain.linearRampToValueAtTime(gainB, now + rampTime);
  }

  getCrossfaderValue(): number {
    return this.crossfaderValue;
  }

  setEQ(deck: Deck, band: EQBand, value: number, rampTime = this.RAMP_TIME): void {
    const state = this.decks[deck];
    const node = band === 'low' ? state.eqLow : band === 'mid' ? state.eqMid : state.eqHigh;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(Math.max(-12, Math.min(12, value)), now + rampTime);
  }

  getEQ(deck: Deck, band: EQBand): number {
    const state = this.decks[deck];
    const node = band === 'low' ? state.eqLow : band === 'mid' ? state.eqMid : state.eqHigh;
    return node.gain.value;
  }

  setMasterVolume(value: number): void {
    const gain = this.masterGain.gain;
    const now = this.ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(Math.max(0, Math.min(1, value)), now + this.RAMP_TIME);
  }

  startRecording(): void {
    if (this.recorder) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.masterLimiter.connect(this.recordDest);
    }
    const mimeType = ['audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    this.recordChunks = [];
    this.recorder = new MediaRecorder(this.recordDest.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordChunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      const recorder = this.recorder;
      if (!recorder) {
        resolve(new Blob([], { type: 'audio/webm' }));
        return;
      }
      recorder.onstop = () => {
        this.recorder = null;
        resolve(new Blob(this.recordChunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
  }

  isRecording(): boolean {
    return this.recorder !== null;
  }

  getAnalyserNode(deck: Deck): AnalyserNode {
    return this.decks[deck].analyser;
  }

  getDeckOutputNode(deck: Deck): GainNode {
    return this.decks[deck].gainNode;
  }

  // Post-crossfader, pre-limiter join for effect wet paths: tails ride through
  // the master limiter (and the recorder) but aren't cut off by the crossfader.
  getEffectsBus(): GainNode {
    return this.masterGain;
  }

  // Wall-clock delay between a deck's source position and what's audible.
  getOutputLatency(deck: Deck): number {
    return this.decks[deck].keylock ? 0.055 : 0;
  }

  // Splice an effect node in-line after the deck's EQ chain (analyser → node →
  // crossfader gain). Returns a function that restores the direct connection.
  insertDeckEffect(deck: Deck, node: AudioNode): () => void {
    const state = this.decks[deck];
    const dest = deck === 'A' ? this.crossfaderGainA : this.crossfaderGainB;
    try {
      state.analyser.disconnect(dest);
    } catch (_) {
      // already re-routed by an overlapping insert; run in parallel with it
    }
    state.analyser.connect(node);
    node.connect(dest);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      try {
        state.analyser.disconnect(node);
        node.disconnect(dest);
      } catch (_) {}
      try {
        state.analyser.connect(dest);
      } catch (_) {}
    };
  }
}
