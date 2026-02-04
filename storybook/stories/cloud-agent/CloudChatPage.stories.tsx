import type { Meta, StoryObj } from '@storybook/nextjs';
import { CloudChatPage } from '@/components/cloud-agent/CloudChatPage';
import { CloudAgentProvider } from '@/components/cloud-agent/CloudAgentProvider';
import { withQueryClient } from '../../src/decorators/withQueryClient';
import { withSessionProvider } from '../../src/decorators/withSessionProvider';
import { withTRPC } from '../../src/decorators/withTRPC';
import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import {
  currentSessionIdAtom,
  sessionConfigAtom,
  updateMessageAtom,
} from '@/components/cloud-agent/store/atoms';
import { dbSessionsAtom } from '@/components/cloud-agent/store/db-session-atoms';
import type { CloudMessage } from '@/components/cloud-agent/types';

// Mock data for testing
const mockSessionId = 'agent_test_session_123';
const mockRepository = 'user/my-nextjs-app';

const mockMessages: CloudMessage[] = [
  {
    ts: Date.now() - 300000,
    type: 'user',
    text: 'Can you help me add a login form to this application?',
    content: 'Can you help me add a login form to this application?',
  },
  {
    ts: Date.now() - 290000,
    type: 'assistant',
    say: 'text',
    text: "I'll help you create a login form. Let me first check the existing authentication setup.",
    content:
      "I'll help you create a login form. Let me first check the existing authentication setup.",
  },
  {
    ts: Date.now() - 285000,
    type: 'system',
    ask: 'tool',
    content: 'Reading authentication route file',
    metadata: {
      toolName: 'read_file',
      input: { file_path: 'src/app/api/auth/route.ts' },
      output:
        "import { NextRequest } from 'next/server';\nimport { hash, compare } from 'bcrypt';\n\nexport async function POST(request: NextRequest) {\n  const { email, password } = await request.json();\n  // Authentication logic here...\n  return Response.json({ success: true });\n}",
    },
  },
  {
    ts: Date.now() - 280000,
    type: 'assistant',
    say: 'completion_result',
    text: "I've analyzed your authentication setup. I'll create a login form component with proper validation and error handling.",
    content:
      "I've analyzed your authentication setup. I'll create a login form component with proper validation and error handling.",
  },
  {
    ts: Date.now() - 270000,
    type: 'user',
    text: 'Great! Please also add email and password validation.',
    content: 'Great! Please also add email and password validation.',
  },
  {
    ts: Date.now() - 265000,
    type: 'assistant',
    say: 'text',
    text: "I'll add comprehensive validation including email format checking and password strength requirements.",
    content:
      "I'll add comprehensive validation including email format checking and password strength requirements.",
  },
  {
    ts: Date.now() - 260000,
    type: 'system',
    ask: 'tool',
    content: 'Writing login form component',
    metadata: {
      toolName: 'write_to_file',
      input: {
        file_path: 'src/components/LoginForm.tsx',
        content:
          'import { useState } from "react";\n\nexport function LoginForm() {\n  const [email, setEmail] = useState("");\n  const [password, setPassword] = useState("");\n  // Form implementation...\n}',
      },
      output: '',
    },
  },
  {
    ts: Date.now() - 255000,
    type: 'system',
    ask: 'command',
    content: 'Running type check',
    metadata: {
      toolName: 'bash',
      input: { command: 'npm run typecheck' },
      output: 'Checking TypeScript files...\n✓ All files passed type checking\nFound 0 errors',
    },
  },
  {
    ts: Date.now() - 250000,
    type: 'assistant',
    say: 'completion_result',
    text: "I've created the LoginForm component with email validation (regex pattern) and password strength requirements (min 8 chars, uppercase, lowercase, number). The component is fully typed and passes TypeScript checks.",
    content:
      "I've created the LoginForm component with email validation (regex pattern) and password strength requirements (min 8 chars, uppercase, lowercase, number). The component is fully typed and passes TypeScript checks.",
  },
];

// Mock DB sessions (matches DbSession type)
const mockDbSessions = [
  {
    session_id: mockSessionId,
    title: 'Add a login form',
    git_url: `https://github.com/${mockRepository}.git`,
    cloud_agent_session_id: mockSessionId,
    created_on_platform: 'cloud-agent',
    created_at: new Date(Date.now() - 300000),
    updated_at: new Date(Date.now() - 260000),
    last_mode: 'code' as const,
    last_model: 'claude-3-5-sonnet-20241022',
    version: 0,
    organization_id: null,
  },
  {
    session_id: 'session_456',
    title: 'Fix TypeScript errors',
    git_url: 'https://github.com/user/my-react-app.git',
    cloud_agent_session_id: 'agent_session_456',
    created_on_platform: 'cli',
    created_at: new Date(Date.now() - 600000),
    updated_at: new Date(Date.now() - 500000),
    last_mode: 'debug' as const,
    last_model: 'claude-3-5-sonnet-20241022',
    version: 0,
    organization_id: null,
  },
  {
    session_id: 'session_789',
    title: 'Design new dashboard layout',
    git_url: 'https://github.com/org/enterprise-app.git',
    cloud_agent_session_id: 'agent_session_789',
    created_on_platform: 'vscode',
    created_at: new Date(Date.now() - 900000),
    updated_at: new Date(Date.now() - 800000),
    last_mode: 'architect' as const,
    last_model: 'mock-model-for-storybook',
    version: 0,
    organization_id: null,
  },
];

// Wrapper component to initialize state for stories
function StoryWrapper({
  children,
  withMessages = false,
  withSession = false,
}: {
  children: React.ReactNode;
  withMessages?: boolean;
  withSession?: boolean;
}) {
  const setCurrentSessionId = useSetAtom(currentSessionIdAtom);
  const setSessionConfig = useSetAtom(sessionConfigAtom);
  const updateMessage = useSetAtom(updateMessageAtom);
  const setDbSessions = useSetAtom(dbSessionsAtom);

  useEffect(() => {
    if (withSession) {
      setCurrentSessionId(mockSessionId);
      setSessionConfig({
        sessionId: mockSessionId,
        repository: mockRepository,
        mode: 'code',
        model: 'claude-3-5-sonnet-20241022',
      });
      setDbSessions(mockDbSessions);
    }

    if (withMessages) {
      // Add messages one by one using updateMessageAtom
      mockMessages.forEach(msg => {
        updateMessage(msg);
      });
    }
  }, [
    withSession,
    withMessages,
    setCurrentSessionId,
    setSessionConfig,
    updateMessage,
    setDbSessions,
  ]);

  return <>{children}</>;
}

const meta: Meta<typeof CloudChatPage> = {
  title: 'Cloud Agent/CloudChatPage',
  component: CloudChatPage,
  decorators: [
    withTRPC,
    withQueryClient,
    withSessionProvider,
    Story => (
      <CloudAgentProvider>
        <Story />
      </CloudAgentProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state - No active session
 * Use the viewport toolbar to test on different devices
 */
export const NoSession: Story = {
  args: {},
};

/**
 * Active session with conversation messages
 * Use the viewport toolbar to test responsive behavior:
 * - iPhone SE (375px) - smallest mobile
 * - iPhone 12 Pro Max (428px) - larger mobile
 * - iPad (768px) - tablet breakpoint
 * - Desktop (responsive)
 */
export const WithMessages: Story = {
  args: {},
  decorators: [
    Story => (
      <StoryWrapper withSession withMessages>
        <Story />
      </StoryWrapper>
    ),
  ],
};

/**
 * Active session without messages yet
 * Shows the empty conversation state
 */
export const EmptyConversation: Story = {
  args: {},
  decorators: [
    Story => (
      <StoryWrapper withSession>
        <Story />
      </StoryWrapper>
    ),
  ],
};

/**
 * Organization context
 * Shows how the UI adapts for organization-scoped sessions
 */
export const WithOrganization: Story = {
  args: {
    organizationId: 'org_123456',
  },
  decorators: [
    Story => (
      <StoryWrapper withSession withMessages>
        <Story />
      </StoryWrapper>
    ),
  ],
};

/**
 * Tool execution with errors
 * Shows how failed tool executions are displayed
 */
export const WithToolErrors: Story = {
  args: {},
  decorators: [
    Story => {
      const setUpdateMessage = useSetAtom(updateMessageAtom);
      const setCurrentSessionId = useSetAtom(currentSessionIdAtom);
      const setSessionConfig = useSetAtom(sessionConfigAtom);
      const setDbSessions = useSetAtom(dbSessionsAtom);

      useEffect(() => {
        setCurrentSessionId(mockSessionId);
        setSessionConfig({
          sessionId: mockSessionId,
          repository: mockRepository,
          mode: 'code',
          model: 'claude-3-5-sonnet-20241022',
        });
        setDbSessions(mockDbSessions);

        // Add messages with tool errors
        const errorMessages: CloudMessage[] = [
          {
            ts: Date.now() - 200000,
            type: 'user',
            text: 'Can you run the build command?',
            content: 'Can you run the build command?',
          },
          {
            ts: Date.now() - 190000,
            type: 'assistant',
            say: 'text',
            text: "I'll run the build command for you.",
            content: "I'll run the build command for you.",
          },
          {
            ts: Date.now() - 185000,
            type: 'system',
            ask: 'command',
            content: 'Running build',
            metadata: {
              toolName: 'bash',
              input: { command: 'npm run build' },
              error:
                'Error: Command failed with exit code 1\n\nTypeError: Cannot read property "map" of undefined\n  at LoginForm.tsx:42:15\n\nFound 3 type errors.',
            },
          },
          {
            ts: Date.now() - 180000,
            type: 'assistant',
            say: 'text',
            text: "The build failed due to type errors. Let me fix the LoginForm component where it's trying to map over an undefined value.",
            content:
              "The build failed due to type errors. Let me fix the LoginForm component where it's trying to map over an undefined value.",
          },
          {
            ts: Date.now() - 175000,
            type: 'system',
            ask: 'tool',
            content: 'Fixing LoginForm component',
            metadata: {
              toolName: 'edit',
              input: {
                file_path: 'src/components/LoginForm.tsx',
                old_string: 'errors.map(e => e.message)',
                new_string: 'errors?.map(e => e.message) ?? []',
              },
              output: 'Successfully edited src/components/LoginForm.tsx',
            },
          },
          {
            ts: Date.now() - 170000,
            type: 'system',
            ask: 'command',
            content: 'Running build again',
            metadata: {
              toolName: 'bash',
              input: { command: 'npm run build' },
              output:
                '> build\n> next build\n\n✓ Creating optimized production build\n✓ Compiled successfully\n✓ Collecting page data\n✓ Finalizing page optimization\n\nBuild completed successfully!',
            },
          },
        ];

        errorMessages.forEach(msg => {
          setUpdateMessage(msg);
        });
      }, [setUpdateMessage, setCurrentSessionId, setSessionConfig, setDbSessions]);

      return <Story />;
    },
  ],
};
