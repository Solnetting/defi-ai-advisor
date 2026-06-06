import React from "react";

interface MetricRowProps {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}

export function MetricRow({ label, value, sub, valueColor = "text-white" }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-500 font-mono">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-mono font-semibold ${valueColor}`}>{value}</span>
        {sub && <span className="text-xs text-gray-600 ml-2 font-mono">{sub}</span>}
      </div>
    </div>
  );
}
