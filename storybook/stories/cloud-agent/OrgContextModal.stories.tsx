import type { Meta, StoryObj } from '@storybook/nextjs';
import { OrgContextModal } from '@/components/cloud-agent/OrgContextModal';
import { withQueryClient } from '../../src/decorators/withQueryClient';
import { withTRPC } from '../../src/decorators/withTRPC';

const meta: Meta<typeof OrgContextModal> = {
  title: 'Cloud Agent/OrgContextModal',
  component: OrgContextModal,
  decorators: [withTRPC, withQueryClient],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    onClose: { action: 'onClose' },
    onConfirm: { action: 'onConfirm' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default open state showing organization selection
 */
export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: orgContext => console.log('Confirmed:', orgContext),
    sessionTitle: 'Implement user authentication',
  },
};

/**
 * With a long session title that gets truncated
 */
export const LongSessionTitle: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: orgContext => console.log('Confirmed:', orgContext),
    sessionTitle:
      'Fix all TypeScript errors and update all dependencies to the latest versions while ensuring backwards compatibility',
  },
};

/**
 * With null session title (shows fallback text)
 */
export const NoSessionTitle: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: orgContext => console.log('Confirmed:', orgContext),
    sessionTitle: null,
  },
};

/**
 * Closed state (not visible)
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => console.log('Modal closed'),
    onConfirm: orgContext => console.log('Confirmed:', orgContext),
    sessionTitle: 'Test session',
  },
};
