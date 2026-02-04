import type { Meta, StoryObj } from '@storybook/nextjs';
import { ChatSidebar } from '@/components/cloud-agent/ChatSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { StoredSession } from '@/components/cloud-agent/types';

const meta: Meta<typeof ChatSidebar> = {
  title: 'Cloud Agent/ChatSidebar',
  component: ChatSidebar,
  decorators: [
    Story => (
      <SidebarProvider defaultOpen={true}>
        <Story />
      </SidebarProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockSessions: StoredSession[] = [
  {
    sessionId: 'session-active-1',
    repository: 'user/my-nextjs-app',
    prompt: 'Implement user authentication with NextAuth.js',
    mode: 'code',
    model: 'claude-3.5-sonnet',
    status: 'active',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    messages: [],
    createdOnPlatform: 'cloud-agent', // Cloud badge
  },
  {
    sessionId: 'session-completed-1',
    repository: 'user/my-react-app',
    prompt: 'Add dark mode support to the application',
    mode: 'code',
    model: 'claude-3.5-sonnet',
    status: 'completed',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    messages: [],
    createdOnPlatform: 'cli', // CLI badge
  },
  {
    sessionId: 'session-error-1',
    repository: 'user/my-api',
    prompt: 'Refactor the authentication middleware',
    mode: 'code',
    model: 'claude-3.5-sonnet',
    status: 'error',
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    messages: [],
    createdOnPlatform: 'vscode', // Extension badge
  },
  {
    sessionId: 'session-completed-2',
    repository: 'organization/enterprise-app',
    prompt: 'Update all dependencies to latest versions',
    mode: 'code',
    model: 'claude-3-opus',
    status: 'completed',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
    messages: [],
    createdOnPlatform: 'cloud-agent', // Cloud badge
  },
  {
    sessionId: 'session-active-2',
    repository: 'user/mobile-app',
    prompt: 'Create a new feature for push notifications',
    mode: 'code',
    model: 'claude-3.5-sonnet',
    status: 'active',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    messages: [],
    createdOnPlatform: 'cli', // CLI badge
  },
];

export const Default: Story = {
  args: {
    sessions: mockSessions,
    onNewSession: () => console.log('New session clicked'),
    onSelectSession: (sessionId: string) => console.log('Selected session:', sessionId),
    onDeleteSession: (sessionId: string) => console.log('Delete session:', sessionId),
  },
};

export const Empty: Story = {
  args: {
    sessions: [],
    onNewSession: () => console.log('New session clicked'),
  },
};

export const WithCurrentSession: Story = {
  args: {
    sessions: mockSessions,
    currentSessionId: 'session-active-1',
    onNewSession: () => console.log('New session clicked'),
    onSelectSession: (sessionId: string) => console.log('Selected session:', sessionId),
    onDeleteSession: (sessionId: string) => console.log('Delete session:', sessionId),
  },
};

export const SingleSession: Story = {
  args: {
    sessions: [mockSessions[0]],
    currentSessionId: 'session-active-1',
    onNewSession: () => console.log('New session clicked'),
    onSelectSession: (sessionId: string) => console.log('Selected session:', sessionId),
    onDeleteSession: (sessionId: string) => console.log('Delete session:', sessionId),
  },
};

export const WithOrganization: Story = {
  args: {
    sessions: mockSessions,
    currentSessionId: 'session-completed-1',
    organizationId: 'org-123',
    onNewSession: () => console.log('New session clicked'),
    onSelectSession: (sessionId: string) => console.log('Selected session:', sessionId),
    onDeleteSession: (sessionId: string) => console.log('Delete session:', sessionId),
  },
};

export const ManySessionsScrollable: Story = {
  args: {
    sessions: [
      ...mockSessions,
      ...mockSessions.map((s, i) => ({
        ...s,
        sessionId: `${s.sessionId}-duplicate-${i}`,
        prompt: `${s.prompt} (duplicate ${i + 1})`,
      })),
    ],
    currentSessionId: 'session-active-1',
    onNewSession: () => console.log('New session clicked'),
    onSelectSession: (sessionId: string) => console.log('Selected session:', sessionId),
    onDeleteSession: (sessionId: string) => console.log('Delete session:', sessionId),
  },
};

export const InSheet: Story = {
  args: {
    sessions: mockSessions,
    currentSessionId: 'session-active-1',
    onNewSession: () => console.log('New session clicked'),
    onSelectSession: (sessionId: string) => console.log('Selected session:', sessionId),
    onDeleteSession: (sessionId: string) => console.log('Delete session:', sessionId),
    isInSheet: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          "When rendered in a mobile Sheet, extra top padding is added to prevent overlap with the Sheet's close button (X).",
      },
    },
  },
};
