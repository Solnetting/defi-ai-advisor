import type { Meta, StoryObj } from "@storybook/react";
import { MetricRow } from "../components/MetricRow";

const meta: Meta<typeof MetricRow> = {
  title: "DS/MetricRow",
  component: MetricRow,
  parameters: { backgrounds: { default: "dark" } },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof MetricRow>;

export const Default: Story = { args: { label: "Staked", value: "49.05 SOL", sub: "·  $8,093" } };
export const Highlighted: Story = { args: { label: "Idle", value: "0.04 SOL", sub: "· $6.60", valueColor: "text-yellow-300" } };
export const APY: Story = { args: { label: "Native APY", value: "7.2%", valueColor: "text-green-400" } };

export const Group: Story = {
  render: () => (
    <div style={{ background: "#111", padding: 16, borderRadius: 12, width: 320 }}>
      <MetricRow label="Staked"     value="49.05 SOL" sub="· $8,093" />
      <MetricRow label="Idle"       value="0.04 SOL"  sub="· $6.60"  valueColor="text-yellow-300" />
      <MetricRow label="Kamino"     value="$240"      valueColor="text-white" />
      <MetricRow label="Stables"    value="$500 USDC" />
      <MetricRow label="Native APY" value="7.2%"      valueColor="text-green-400" />
    </div>
  ),
};
