import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  accent?: 'default' | 'blue' | 'none';
}

const topBorder = {
  default: 'border-t-amber-500/20',
  blue: 'border-t-blue-400/20',
  none: '',
};

export function Card({ children, className = '', accent = 'none' }: CardProps) {
  return (
    <div
      className={`bg-bg-secondary rounded-xl border border-border ${topBorder[accent]} shadow-[0_2px_12px_rgba(0,0,0,0.4)] ${className}`}
    >
      {children}
    </div>
  );
}
