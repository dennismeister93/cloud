import type { Meta, StoryObj } from '@storybook/nextjs';
import { ChatHeader } from '@/components/cloud-agent/ChatHeader';
import { withTRPC } from '../../src/decorators/withTRPC';

const meta: Meta<typeof ChatHeader> = {
  title: 'Cloud Agent/ChatHeader',
  component: ChatHeader,
  decorators: [withTRPC],
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    cloudAgentSessionId: 'agent_abc123-def456',
    kiloSessionId: 'fcf370f8-7c39-4afe-9b4e-425948b7241b',
    repository: 'user/my-nextjs-app',
    branch: 'agent_abc123-def456',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: false,
    totalCost: 0,
    sessionTitle: 'Fix authentication bug in login flow',
  },
};

export const Streaming: Story = {
  args: {
    cloudAgentSessionId: 'agent_xyz789-uvw012',
    kiloSessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    repository: 'user/my-react-app',
    branch: 'agent_xyz789-uvw012',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: true,
    totalCost: 0.0234,
    sessionTitle: 'Implement user dashboard',
  },
};

export const WithCost: Story = {
  args: {
    cloudAgentSessionId: 'agent_xyz789-uvw012',
    kiloSessionId: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    repository: 'user/my-react-app',
    branch: 'agent_xyz789-uvw012',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: false,
    totalCost: 0.1542,
    sessionTitle: 'Refactor API endpoints',
  },
};

export const LongSessionId: Story = {
  args: {
    cloudAgentSessionId: 'agent_very-long-session-id-that-will-be-truncated-in-the-ui',
    kiloSessionId: 'c3d4e5f6-a7b8-9012-cdef-345678901234',
    repository: 'organization/enterprise-app',
    branch: 'agent_very-long-session-id-that-will-be-truncated-in-the-ui',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: false,
    totalCost: 0,
    sessionTitle: 'Enterprise feature implementation',
  },
};

export const LongRepositoryName: Story = {
  args: {
    cloudAgentSessionId: 'agent_123',
    kiloSessionId: 'd4e5f6a7-b8c9-0123-defa-456789012345',
    repository: 'organization-with-very-long-name/repository-with-extremely-long-name',
    branch: 'agent_123',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: false,
    totalCost: 0,
    sessionTitle: 'Bug fix',
  },
};

export const StreamingWithLongNames: Story = {
  args: {
    cloudAgentSessionId: 'agent_very-long-id-that-needs-truncation',
    kiloSessionId: 'e5f6a7b8-c9d0-1234-efab-567890123456',
    repository: 'my-organization/my-very-long-repository-name',
    branch: 'agent_very-long-id-that-needs-truncation',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: true,
    totalCost: 0.0756,
    sessionTitle: 'Complex feature with streaming',
  },
};

export const WithoutKiloSessionId: Story = {
  args: {
    cloudAgentSessionId: 'agent_no-db-session',
    repository: 'user/my-app',
    branch: 'agent_no-db-session',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: false,
    totalCost: 0,
  },
};

export const WithoutSessionTitle: Story = {
  args: {
    cloudAgentSessionId: 'agent_abc123',
    kiloSessionId: 'f6a7b8c9-d0e1-2345-fab0-678901234567',
    repository: 'user/my-app',
    branch: 'agent_abc123',
    model: 'claude-3-5-sonnet-20241022',
    isStreaming: false,
    totalCost: 0,
  },
};
