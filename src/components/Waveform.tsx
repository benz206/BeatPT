import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { AudioEngine } from '../engine/AudioEngine';

interface WaveformProps {
  deckId: 'A' | 'B';
}

const ACCENT_A = '#d4872c';
const ACCENT_B = '#6b9fff';
const DIM_A = '#d4872c33';
const DIM_B = '#6b9fff33';

const W = 600;
const H = 80;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Pre-renders beat grid + waveform bars once per track so the rAF loop only blits.
function buildStaticLayer(
  waveformData: number[],
  beatPositions: number[],
  duration: number,
  barColor: string
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  if (duration > 0) {
    for (let i = 0; i < beatPositions.length; i++) {
      const bx = Math.round((beatPositions[i] / duration) * W);
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(bx, 0, 1, H);
    }
  }

  const barCount = waveformData.length;
  const barWidth = Math.max(1, W / barCount);
  const gap = 1;
  ctx.fillStyle = barColor;
  for (let i = 0; i < barCount; i++) {
    const x = (i / barCount) * W;
    const barH = Math.max(2, waveformData[i] * H * 0.9);
    const y = (H - barH) / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(1, barWidth - gap), barH, 1);
    ctx.fill();
  }

  return canvas;
}

export function Waveform({ deckId }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const hoverRef = useRef<number | null>(null);
  const lastDrawRef = useRef({ playedX: -1, hover: null as number | null, time: '' });

  const track = useAppStore((s) => (deckId === 'A' ? s.deckA : s.deckB).track);

  const accentColor = deckId === 'A' ? ACCENT_A : ACCENT_B;
  const dimColor = deckId === 'A' ? DIM_A : DIM_B;

  const layers = useMemo(() => {
    if (!track || track.waveformData.length === 0) return null;
    return {
      dim: buildStaticLayer(track.waveformData, track.beatPositions, track.duration, dimColor),
      bright: buildStaticLayer(track.waveformData, track.beatPositions, track.duration, accentColor),
    };
  }, [track, accentColor, dimColor]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !track) return;
    const rect = canvas.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const position = Math.max(0, pct * track.duration);
    AudioEngine.getInstance().seek(deckId, position);
  }, [deckId, track]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !track) return;
    const rect = canvas.getBoundingClientRect();
    hoverRef.current = (e.clientX - rect.left) / rect.width;
  }, [track]);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    lastDrawRef.current = { playedX: -1, hover: null, time: '' };

    if (!layers || !track) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff08';
      ctx.fillRect(0, H / 2 - 1, W, 2);
      return;
    }

    const engine = AudioEngine.getInstance();
    const duration = track.duration;

    function draw() {
      const position = engine.getPlaybackPosition(deckId);
      const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
      const playedX = Math.floor(progress * W);
      const hover = hoverRef.current;
      const timeStr = formatTime(position);

      const last = lastDrawRef.current;
      if (playedX === last.playedX && hover === last.hover && timeStr === last.time) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      lastDrawRef.current = { playedX, hover, time: timeStr };

      ctx!.clearRect(0, 0, W, H);
      ctx!.drawImage(layers!.dim, 0, 0);
      if (playedX > 0) {
        ctx!.drawImage(layers!.bright, 0, 0, playedX, H, 0, 0, playedX, H);
      }

      if (progress > 0 && progress < 1) {
        ctx!.fillStyle = accentColor;
        ctx!.fillRect(playedX, 0, 2, H);
      }

      if (hover !== null && hover >= 0 && hover <= 1) {
        const hx = Math.round(hover * W);
        ctx!.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx!.fillRect(hx, 0, 1, H);

        const hoverStr = formatTime(hover * duration);
        ctx!.font = '10px monospace';
        const textWidth = ctx!.measureText(hoverStr).width;
        const textX = hx + 6 + textWidth > W ? hx - textWidth - 4 : hx + 6;
        ctx!.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx!.fillText(hoverStr, textX, 12);
      }

      ctx!.font = '11px monospace';
      ctx!.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx!.fillText(timeStr, 8, H - 6);

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deckId, track, layers, accentColor]);

  const duration = track?.duration ?? 0;

  return (
    <div className="relative bg-bg-tertiary rounded-lg overflow-hidden border border-border">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full h-20 block cursor-pointer"
      />
      <div className="absolute bottom-1 right-2 text-[11px] text-text-muted font-mono pointer-events-none">
        {formatTime(duration)}
      </div>
    </div>
  );
}
