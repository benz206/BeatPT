import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Card, Label } from './ui';

interface KeyBubble {
  id: string;
  key: string;
  x: number;
  y: number;
  color: string;
  createdAt: number;
}

const COLORS = ['#d4872c', '#6b9fff', '#e8e6e3', '#8a8690'];
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
    <Card accent="blue" className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0">
        <div className="absolute top-2.5 left-3 z-10">
          <Label>Keys</Label>
        </div>

        {!isMashMode && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-text-muted">Enable Mash Mode</p>
          </div>
        )}

        {bubbles.map((bubble) => {
          const age = now - bubble.createdAt;
          const opacity = Math.max(0, 1 - age / LIFETIME_MS);
          const scale = 0.85 + 0.15 * (1 - age / LIFETIME_MS);
          return (
            <div
              key={bubble.id}
              className="absolute flex items-center justify-center rounded text-xs font-medium border px-2.5 py-1"
              style={{
                left: bubble.x,
                top: bubble.y,
                color: bubble.color,
                borderColor: `${bubble.color}33`,
                background: `${bubble.color}0a`,
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
    </Card>
  );
}
