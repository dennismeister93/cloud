import type { Meta, StoryObj } from '@storybook/nextjs';
import { BrowseCommandsDialog } from '@/components/cloud-agent/BrowseCommandsDialog';

const meta: Meta<typeof BrowseCommandsDialog> = {
  title: 'Cloud Agent/BrowseCommandsDialog',
  component: BrowseCommandsDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
