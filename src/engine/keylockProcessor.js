// Keylock: key-preserving pitch compensation for varispeed decks.
//
// The deck plays an AudioBufferSourceNode at `rate` (0.5..2), which shifts both
// tempo AND pitch by `rate`. This processor sits downstream and shifts pitch by
// exactly 1/rate, so the net pitch is unchanged while the tempo change remains.
//
// Pipeline: WSOLA time-stretch (tempo factor = rate) -> linear resampler
// (step = 1/rate). Net throughput is 1:1 (stretcher consumes rate*(seq-ovl) and
// emits (seq-ovl); resampler consumes 1/rate input per output frame), so the
// internal FIFOs hover around equilibrium and never grow or starve unboundedly.
//
// Loaded standalone via audioWorklet.addModule(url): plain JS, zero imports.

const BLOCK = 128;
const FIFO_CAP = 16384; // power of two -> ring index via & FIFO_MASK
const FIFO_MASK = FIFO_CAP - 1;

class KeylockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // WSOLA window sizes in samples, derived from sampleRate.
    this.ovl = Math.round(0.008 * sampleRate);  // crossfade overlap
    this.seek = Math.round(0.015 * sampleRate);  // correlation search window
    this.seq = Math.round(0.040 * sampleRate);  // sequence length
    const ovl = this.ovl;

    // Smoothed control state. tempo = r, step = 1/r are BOTH derived from the
    // same smoothed `rate` each block so the compensation stays exact.
    this.rate = 1;        // current working rate (smoothed)
    this.targetRate = 1;  // target from control messages
    // Exponential smoothing constant for a ~50 ms time constant, per block.
    this.smoothK = 1 - Math.exp(-BLOCK / (sampleRate * 0.05));

    // --- inputFifo: raw deck audio waiting to be stretched. ---
    // Absolute write counter and absolute read position (stretcher cursor);
    // ring slot = abs & FIFO_MASK. readPos only ever moves forward, so data
    // below it is implicitly discarded (overwritten on later wraps).
    this.inL = new Float32Array(FIFO_CAP);
    this.inR = new Float32Array(FIFO_CAP);
    this.inWrite = 0; // absolute count of samples appended
    this.readPos = 0; // absolute stretcher read cursor (<= inWrite)

    // --- midBuffer: tail of the previous emitted sequence, per channel. ---
    // Crossfaded against the next chosen sequence head. Starts as silence.
    this.midL = new Float32Array(ovl);
    this.midR = new Float32Array(ovl);

    // --- stretchFifo: time-stretched output feeding the resampler. ---
    // Absolute write counter; resampler reads at fractional resamplePos and we
    // free everything it has fully passed via stretchRead.
    this.outL = new Float32Array(FIFO_CAP);
    this.outR = new Float32Array(FIFO_CAP);
    this.stretchWrite = 0; // absolute count of stretched samples produced
    this.stretchRead = 0;  // absolute index of oldest still-needed sample

    // Fractional read position into the stretch stream (absolute units).
    this.resamplePos = 0;
    // Fractional accumulator for the stretcher's per-iteration input advance.
    this.advanceAcc = 0;

    // Mono scratch for correlation (input candidate window length = ovl).
    this.monoMid = new Float32Array(ovl);

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && typeof d.rate === 'number') {
        this.targetRate = Math.min(2, Math.max(0.5, d.rate));
        // rampTime is accepted for protocol compatibility; the per-block
        // exponential glide below provides the smoothing regardless.
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1];

    const ovl = this.ovl;
    const seek = this.seek;
    const seq = this.seq;

    // Glide working rate toward target; derive tempo and step from the SAME r.
    this.rate += (this.targetRate - this.rate) * this.smoothK;
    const tempo = this.rate;
    const step = 1 / this.rate;

    // --- 1. Append the 128 input frames (or silence) to inputFifo. ---
    // Node is channelCount 2 explicit, but a disconnected source can deliver 0
    // channels: treat as silence so the pipeline drains. 1 channel -> dual mono.
    const inCh = input.length;
    const srcL = inCh > 0 ? input[0] : null;
    const srcR = inCh > 1 ? input[1] : srcL; // 1 channel feeds both
    for (let i = 0; i < BLOCK; i++) {
      const slot = (this.inWrite + i) & FIFO_MASK;
      this.inL[slot] = srcL ? srcL[i] : 0;
      this.inR[slot] = srcR ? srcR[i] : 0;
    }
    this.inWrite += BLOCK;

    // --- 2. Run WSOLA iterations while there is enough input AND output room. ---
    // Gate on availability + free space so neither FIFO grows/starves unbounded.
    const inAL = this.inL, inAR = this.inR;
    const outAL = this.outL, outAR = this.outR;
    const midL = this.midL, midR = this.midR;
    const monoMid = this.monoMid;

    // Available unread input ahead of readPos; free space in stretchFifo.
    // We need (seq + seek) input lookahead and (seq - ovl) output space.
    while (
      this.inWrite - this.readPos >= seq + seek &&
      FIFO_CAP - (this.stretchWrite - this.stretchRead) >= seq - ovl
    ) {
      // 2a. Find offset in [0, seek) maximizing normalized cross-correlation
      // between midBuffer and input[readPos+offset ..], on the mono (sum) signal.
      // First iteration (mid all zero) -> offset 0.
      let off = 0;
      if (this.stretchWrite > 0) {
        // Precompute mono mid once per iteration.
        for (let i = 0; i < ovl; i++) monoMid[i] = midL[i] + midR[i];
        let best = -Infinity;
        for (let o = 0; o < seek; o++) {
          const base = this.readPos + o;
          let num = 0;
          let den = 0;
          for (let i = 0; i < ovl; i++) {
            const slot = (base + i) & FIFO_MASK;
            const s = inAL[slot] + inAR[slot];
            num += monoMid[i] * s;
            den += s * s;
          }
          const corr = num / Math.sqrt(den + 1e-9);
          if (corr > best) {
            best = corr;
            off = o;
          }
        }
      }

      const start = this.readPos + off; // absolute index of chosen sequence head

      // 2b. Emit ovl crossfaded samples: mid faded out, new head faded in.
      let w = this.stretchWrite;
      for (let i = 0; i < ovl; i++) {
        const fade = i / ovl;
        const inSlot = (start + i) & FIFO_MASK;
        const outSlot = w & FIFO_MASK;
        outAL[outSlot] = midL[i] * (1 - fade) + inAL[inSlot] * fade;
        outAR[outSlot] = midR[i] * (1 - fade) + inAR[inSlot] * fade;
        w++;
      }

      // 2c. Emit the sequence body: (seq - 2*ovl) samples straight through.
      const bodyStart = start + ovl;
      const bodyLen = seq - 2 * ovl;
      for (let i = 0; i < bodyLen; i++) {
        const inSlot = (bodyStart + i) & FIFO_MASK;
        const outSlot = w & FIFO_MASK;
        outAL[outSlot] = inAL[inSlot];
        outAR[outSlot] = inAR[inSlot];
        w++;
      }
      this.stretchWrite = w;

      // 2d. Save new midBuffer: input[start+seq-ovl .. start+seq).
      const midStart = start + seq - ovl;
      for (let i = 0; i < ovl; i++) {
        const inSlot = (midStart + i) & FIFO_MASK;
        midL[i] = inAL[inSlot];
        midR[i] = inAR[inSlot];
      }

      // 2e. Advance read cursor by tempo*(seq-ovl); keep the fractional part.
      // At tempo 1 the advance equals (seq-ovl), so off=0 yields a crossfade
      // between identical content -> a clean delayed copy.
      this.advanceAcc += tempo * (seq - ovl);
      const whole = Math.floor(this.advanceAcc);
      this.readPos += whole;
      this.advanceAcc -= whole;
    }

    // --- 3. Resample stretchFifo at step = 1/rate into the 128 output frames. ---
    // Linear interpolation. Output 0 (without advancing) when fewer than 2
    // samples are available beyond resamplePos: this only occurs during the
    // initial prefill and fixes a rate-independent startup latency.
    let rp = this.resamplePos;
    for (let n = 0; n < BLOCK; n++) {
      const i0 = Math.floor(rp);
      // Need indices i0 and i0+1 to both be produced and not yet freed.
      if (i0 + 1 >= this.stretchWrite || i0 < this.stretchRead) {
        outL[n] = 0;
        outR[n] = 0;
        continue;
      }
      const frac = rp - i0;
      const s0 = i0 & FIFO_MASK;
      const s1 = (i0 + 1) & FIFO_MASK;
      outL[n] = outAL[s0] + (outAL[s1] - outAL[s0]) * frac;
      outR[n] = outAR[s0] + (outAR[s1] - outAR[s0]) * frac;
      rp += step;
    }
    this.resamplePos = rp;

    // Free stretchFifo samples the resampler has fully passed (need i0 onward,
    // so everything strictly below floor(resamplePos) is no longer referenced).
    const consumedTo = Math.floor(rp);
    if (consumedTo > this.stretchRead) this.stretchRead = consumedTo;

    return true;
  }
}

registerProcessor('keylock', KeylockProcessor);
