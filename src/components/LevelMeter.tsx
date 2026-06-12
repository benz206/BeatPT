import { useEffect, useRef } from 'react';
import { AudioEngine } from '../engine/AudioEngine';

interface LevelMeterProps {
  deckId: 'A' | 'B';
}

const W = 6;
const H = 64;

export function LevelMeter({ deckId }: LevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = AudioEngine.getInstance().getAnalyserNode(deckId);
    const data = new Uint8Array(analyser.fftSize);
    let level = 0;
    let rafId = 0;

    function draw() {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      level = Math.max(peak, level * 0.92);

      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = 'rgba(255,255,255,0.06)';
      ctx!.fillRect(0, 0, W, H);

      const barH = Math.round(level * H);
      if (barH > 0) {
        const grad = ctx!.createLinearGradient(0, H, 0, 0);
        grad.addColorStop(0, '#4ade80');
        grad.addColorStop(0.7, '#d4872c');
        grad.addColorStop(1, '#ef4444');
        ctx!.fillStyle = grad;
        ctx!.fillRect(0, H - barH, W, barH);
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [deckId]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="rounded-sm"
      style={{ width: W, height: H }}
    />
  );
}
