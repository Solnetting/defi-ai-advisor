import React from "react";

type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "purple";

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
}

const variants: Record<Variant, string> = {
  success: "bg-green-400/10 text-green-400 border-green-400/20",
  warning: "bg-yellow-300/10 text-yellow-300 border-yellow-300/20",
  danger:  "bg-red-400/10 text-red-400 border-red-400/20",
  info:    "bg-blue-400/10 text-blue-400 border-blue-400/20",
  neutral: "bg-white/5 text-gray-400 border-white/10",
  purple:  "bg-purple-400/10 text-purple-400 border-purple-400/20",
};

export function Badge({ variant = "neutral", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
