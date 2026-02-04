import type { Meta, StoryObj } from '@storybook/nextjs';
import { ErrorBanner } from '@/components/cloud-agent/ErrorBanner';

const meta: Meta<typeof ErrorBanner> = {
  title: 'Cloud Agent/ErrorBanner',
  component: ErrorBanner,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRetry: Story = {
  args: {
    title: 'Connection Failed',
    message:
      'Failed to connect to the cloud agent service. Please check your internet connection and try again.',
    onRetry: () => console.log('Retry clicked'),
  },
};

export const WithDismiss: Story = {
  args: {
    title: 'Session Expired',
    message: 'Your session has expired. Please create a new session to continue.',
    onDismiss: () => console.log('Dismiss clicked'),
  },
};

export const WithBoth: Story = {
  args: {
    title: 'Error',
    message:
      'An unexpected error occurred while processing your request. You can retry the operation or dismiss this message.',
    onRetry: () => console.log('Retry clicked'),
    onDismiss: () => console.log('Dismiss clicked'),
  },
};

export const LongMessage: Story = {
  args: {
    title: 'Authentication Error',
    message:
      'Failed to authenticate with GitHub. This could be due to expired credentials, insufficient permissions, or network issues. Please verify your GitHub token has the required scopes: repo, read:org, and workflow.',
    onRetry: () => console.log('Retry clicked'),
    onDismiss: () => console.log('Dismiss clicked'),
  },
};
