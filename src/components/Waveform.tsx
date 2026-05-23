import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { AudioEngine } from '../engine/AudioEngine';

interface WaveformProps {
  deckId: 'A' | 'B';
}

const ACCENT_A = '#d4872c';
const ACCENT_B = '#6b9fff';
const DIM_A = '#d4872c33';
const DIM_B = '#6b9fff33';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Waveform({ deckId }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const hoverRef = useRef<number | null>(null);

  const track = useAppStore((s) => (deckId === 'A' ? s.deckA : s.deckB).track);
  const currentTimeRef = useRef(0);

  const accentColor = deckId === 'A' ? ACCENT_A : ACCENT_B;
  const dimColor = deckId === 'A' ? DIM_A : DIM_B;

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

    const engine = AudioEngine.getInstance();

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const waveformData = track?.waveformData ?? [];
      const duration = track?.duration ?? 0;
      const beatPositions = track?.beatPositions ?? [];
      const position = engine.getPlaybackPosition(deckId);

      currentTimeRef.current = position;

      if (waveformData.length === 0) {
        ctx.fillStyle = '#ffffff08';
        ctx.fillRect(0, height / 2 - 1, width, 2);
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
      const playedX = Math.floor(progress * width);
      const barCount = waveformData.length;
      const barWidth = Math.max(1, width / barCount);
      const gap = 1;

      // Beat lines (behind waveform)
      if (beatPositions.length > 0 && duration > 0) {
        for (let i = 0; i < beatPositions.length; i++) {
          const bx = Math.round((beatPositions[i] / duration) * width);
          ctx.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
          ctx.fillRect(bx, 0, 1, height);
        }
      }

      // Waveform bars
      for (let i = 0; i < barCount; i++) {
        const x = (i / barCount) * width;
        const barH = Math.max(2, waveformData[i] * height * 0.9);
        const y = (height - barH) / 2;
        const isPlayed = x < playedX;
        ctx.fillStyle = isPlayed ? accentColor : dimColor;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(1, barWidth - gap), barH, 1);
        ctx.fill();
      }

      // Playhead line
      if (duration > 0 && progress > 0 && progress < 1) {
        ctx.fillStyle = accentColor;
        ctx.fillRect(playedX, 0, 2, height);
      }

      // Hover indicator
      const hover = hoverRef.current;
      if (hover !== null && hover >= 0 && hover <= 1 && duration > 0) {
        const hx = Math.round(hover * width);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(hx, 0, 1, height);

        const hoverTime = hover * duration;
        const timeStr = formatTime(hoverTime);
        ctx.font = '10px monospace';
        const textWidth = ctx.measureText(timeStr).width;
        const textX = hx + 6 + textWidth > width ? hx - textWidth - 4 : hx + 6;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(timeStr, textX, 12);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [deckId, track, accentColor, dimColor]);

  const duration = track?.duration ?? 0;

  return (
    <div className="relative bg-bg-tertiary rounded-lg overflow-hidden border border-border">
      <canvas
        ref={canvasRef}
        width={600}
        height={80}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full h-20 block cursor-pointer"
      />
      <div className="absolute bottom-1 left-2 text-[11px] text-text-muted font-mono pointer-events-none">
        {formatTime(currentTimeRef.current)}
      </div>
      <div className="absolute bottom-1 right-2 text-[11px] text-text-muted font-mono pointer-events-none">
        {formatTime(duration)}
      </div>
    </div>
  );
}
