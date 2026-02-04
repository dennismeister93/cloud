import type { Meta, StoryObj } from '@storybook/nextjs';
import { SessionActionsDialog } from '@/components/cloud-agent/SessionActionsDialog';
import { withTRPC } from '../../src/decorators/withTRPC';

const meta: Meta<typeof SessionActionsDialog> = {
  title: 'Cloud Agent/SessionActionsDialog',
  component: SessionActionsDialog,
  decorators: [withTRPC],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    kiloSessionId: 'fcf370f8-7c39-4afe-9b4e-425948b7241b',
    sessionTitle: 'Fix authentication bug in login flow',
    repository: 'user/my-nextjs-app',
  },
};

export const LongSessionTitle: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    kiloSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    sessionTitle:
      'Implement comprehensive user authentication system with OAuth2 support, password reset functionality, and two-factor authentication',
    repository: 'organization/enterprise-application',
  },
};

export const NoSessionTitle: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    kiloSessionId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    repository: 'user/my-react-app',
  },
};

export const NoKiloSessionId: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    sessionTitle: 'Session without ID',
    repository: 'user/my-app',
  },
};

export const MinimalInfo: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    kiloSessionId: 'c3d4e5f6-a7b8-9012-cdef-345678901234',
  },
};
