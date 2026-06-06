import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../components/Button";

const meta: Meta<typeof Button> = {
  title: "DS/Button",
  component: Button,
  parameters: { backgrounds: { default: "dark" } },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: "Stake SOL", variant: "primary", size: "md" } };
export const Ghost: Story   = { args: { children: "Review plan →", variant: "ghost", size: "md" } };
export const Danger: Story  = { args: { children: "Unstake", variant: "danger", size: "md" } };
export const Small: Story   = { args: { children: "Max", variant: "ghost", size: "sm" } };
export const Large: Story   = { args: { children: "Connect Wallet", variant: "primary", size: "lg" } };
export const Loading: Story = { args: { children: "Approving...", variant: "primary", loading: true } };
export const Disabled: Story = { args: { children: "Stake SOL", variant: "primary", disabled: true } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};
