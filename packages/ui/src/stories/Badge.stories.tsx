import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "../components/Badge";

const meta: Meta<typeof Badge> = {
  title: "DS/Badge",
  component: Badge,
  parameters: { backgrounds: { default: "dark" } },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Success: Story = { args: { children: "Active", variant: "success" } };
export const Warning: Story = { args: { children: "Activating", variant: "warning" } };
export const Danger: Story  = { args: { children: "High Risk", variant: "danger" } };
export const Purple: Story  = { args: { children: "Best", variant: "purple" } };
export const Neutral: Story = { args: { children: "Very Low", variant: "neutral" } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge variant="success">Active</Badge>
      <Badge variant="warning">Activating</Badge>
      <Badge variant="danger">High Risk</Badge>
      <Badge variant="purple">Best APY</Badge>
      <Badge variant="info">Jito MEV</Badge>
      <Badge variant="neutral">Very Low</Badge>
    </div>
  ),
};
