import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "DS/Tokens",
  parameters: { backgrounds: { default: "dark" }, controls: { disable: true } },
};
export default meta;

const palette = [
  { name: "black",       hex: "#000000" },
  { name: "gray-900",    hex: "#0a0a0a" },
  { name: "gray-800",    hex: "#1a1a1a" },
  { name: "gray-700",    hex: "#2a2a2a" },
  { name: "gray-500",    hex: "#6b6b6b" },
  { name: "gray-400",    hex: "#9b9b9b" },
  { name: "white",       hex: "#FFFFFF" },
  { name: "purple-400",  hex: "#c084fc" },
  { name: "purple-700",  hex: "#7e22ce" },
  { name: "green-400",   hex: "#4ade80" },
  { name: "yellow-300",  hex: "#fde047" },
  { name: "red-400",     hex: "#f87171" },
];

const typescale = [
  { name: "5xl / 48px — Portfolio Value", size: 48 },
  { name: "3xl / 30px — Section Heading", size: 30 },
  { name: "xl / 20px — Card Title", size: 20 },
  { name: "base / 16px — Body", size: 16 },
  { name: "sm / 14px — Labels", size: 14 },
  { name: "xs / 12px — Meta", size: 12 },
];

export const Colors: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {palette.map(({ name, hex }) => (
        <div key={name} style={{ width: 100, textAlign: "center" }}>
          <div style={{ width: 100, height: 64, borderRadius: 8, background: hex, border: "1px solid #333" }} />
          <p style={{ color: "#9b9b9b", fontSize: 10, marginTop: 6, fontFamily: "monospace" }}>{name}</p>
          <p style={{ color: "#6b6b6b", fontSize: 10, fontFamily: "monospace" }}>{hex}</p>
        </div>
      ))}
    </div>
  ),
};

export const Typography: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {typescale.map(({ name, size }) => (
        <div key={name}>
          <p style={{ color: "#fff", fontSize: size, fontFamily: "'Space Mono', monospace", fontWeight: 700, lineHeight: 1.2 }}>
            $2,599.40
          </p>
          <p style={{ color: "#6b6b6b", fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>{name}</p>
        </div>
      ))}
    </div>
  ),
};
