import type { ReactNode } from 'react';

interface LabelProps {
  children: ReactNode;
  className?: string;
}

export function Label({ children, className = '' }: LabelProps) {
  return (
    <span className={`text-[11px] font-medium uppercase tracking-wider text-text-muted ${className}`}>
      {children}
    </span>
  );
}
