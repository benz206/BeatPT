import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  accent?: 'default' | 'blue';
  className?: string;
}

const accentStyles = {
  default: 'bg-accent-muted text-accent',
  blue: 'bg-accent-2-muted text-accent-2',
};

export function Badge({ children, accent = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md ${accentStyles[accent]} ${className}`}>
      {children}
    </span>
  );
}
