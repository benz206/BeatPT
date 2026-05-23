import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';

interface KeyBubble {
  id: string;
  key: string;
  x: number;
  y: number;
  color: string;
  createdAt: number;
}

const COLORS = ['#e040fb', '#00e5ff', '#76ff03', '#ffea00', '#ff6d00'];
const LIFETIME_MS = 1500;

export function KeyboardVisualizer() {
  const [bubbles, setBubbles] = useState<KeyBubble[]>([]);
  const isMashMode = useAppStore((s) => s.isMashMode);
  const containerRef = useRef<HTMLDivElement>(null);

  const addBubble = useCallback((key: string) => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const x = Math.random() * Math.max(0, width - 48);
    const y = Math.random() * Math.max(0, height - 32);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    setBubbles((prev) => [...prev, { id, key, x, y, color, createdAt: Date.now() }]);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isMashMode) return;
      if (e.repeat) return;
      addBubble(e.key.length === 1 ? e.key.toUpperCase() : e.key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMashMode, addBubble]);

  useEffect(() => {
    if (bubbles.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setBubbles((prev) => prev.filter((b) => now - b.createdAt < LIFETIME_MS));
    }, 100);
    return () => clearInterval(interval);
  }, [bubbles.length]);

  const now = Date.now();

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-bg-secondary rounded-xl border border-white/5 overflow-hidden"
    >
      <div className="absolute top-2 left-3 z-10">
        <span className="text-xs font-black uppercase tracking-widest text-text-secondary">
          Keys
        </span>
      </div>

      {!isMashMode && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-text-secondary">Enable Mash Mode to see key presses</p>
        </div>
      )}

      {bubbles.map((bubble) => {
        const age = now - bubble.createdAt;
        const opacity = Math.max(0, 1 - age / LIFETIME_MS);
        const scale = 0.8 + 0.2 * (1 - age / LIFETIME_MS);
        return (
          <div
            key={bubble.id}
            className="absolute flex items-center justify-center rounded-full text-xs font-black border px-2.5 py-1"
            style={{
              left: bubble.x,
              top: bubble.y,
              color: bubble.color,
              borderColor: bubble.color,
              background: `${bubble.color}22`,
              boxShadow: `0 0 12px ${bubble.color}66`,
              opacity,
              transform: `scale(${scale})`,
              transition: 'opacity 0.1s linear',
              pointerEvents: 'none',
              minWidth: '32px',
              textAlign: 'center',
            }}
          >
            {bubble.key}
          </div>
        );
      })}
    </div>
  );
}
