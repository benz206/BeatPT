import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

const base = 'inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const variantStyles = {
  primary: 'bg-accent text-bg-primary hover:bg-accent-hover rounded',
  secondary: 'bg-bg-tertiary border border-border text-text-secondary hover:border-border-hover hover:text-text-primary rounded',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50 rounded',
};

const sizeStyles = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`${base} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    />
  );
}
