import React from 'react';
import { cn } from '../../shared/utils/cn';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-[background-color,border-color,box-shadow,opacity,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 disabled:scale-100 cursor-pointer select-none";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs active:bg-blue-800",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200/80 active:bg-slate-300/80",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200/70",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-xs active:bg-red-800 focus-visible:ring-red-500/40"
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], "h-9 px-4 py-2", className)}
      {...props}
    />
  );
}
