import type { Meta, StoryObj } from '@storybook/nextjs';
import { ChatInput } from '@/components/cloud-agent/ChatInput';
import type { SlashCommand } from '@/lib/cloud-agent/slash-commands';

const mockSlashCommands: SlashCommand[] = [
  {
    trigger: 'github-open-pullrequest',
    label: 'Open Pull Request',
    description: 'Create a new PR using gh CLI',
    expansion: 'Please open a pull request using the gh cli',
  },
  {
    trigger: 'github-resolve-conflicts',
    label: 'Resolve Merge Conflicts',
    description: 'Pull latest and resolve conflicts from main',
    expansion:
      'please pull the latest version of this branch from the origin and resolve any merge conflicts from main',
  },
  {
    trigger: 'github-address-feedback',
    label: 'Address PR Feedback',
    description: 'Check and address PR comments',
    expansion:
      'Please use the gh cli and check for any unresolved feedback on this pr, please address the feedback, and then mark it as resolved',
  },
  {
    trigger: 'test-run',
    label: 'Run Tests',
    description: 'Run the project test suite',
    expansion: 'Please run the test suite and report any failures',
  },
  {
    trigger: 'test-coverage',
    label: 'Check Test Coverage',
    description: 'Analyze test coverage',
    expansion: 'Please run tests with coverage and identify areas that need more tests',
  },
];

const meta: Meta<typeof ChatInput> = {
  title: 'Cloud Agent/ChatInput',
  component: ChatInput,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onSend: (message: string) => console.log('Send message:', message),
    placeholder: 'Type your message...',
  },
};

export const Disabled: Story = {
  args: {
    onSend: (message: string) => console.log('Send message:', message),
    disabled: true,
    placeholder: 'Waiting for response...',
  },
};

export const CustomPlaceholder: Story = {
  args: {
    onSend: (message: string) => console.log('Send message:', message),
    placeholder: 'Ask the cloud agent to help with your code...',
  },
};

export const Streaming: Story = {
  args: {
    onSend: (message: string) => console.log('Send message:', message),
    onStop: () => console.log('Stop execution'),
    isStreaming: true,
    disabled: true,
    placeholder: 'Streaming...',
  },
};

export const StreamingWithoutStopHandler: Story = {
  args: {
    onSend: (message: string) => console.log('Send message:', message),
    isStreaming: true,
    disabled: true,
    placeholder: 'Streaming...',
  },
};

export const WithSlashCommands: Story = {
  args: {
    onSend: (message: string) => console.log('Send message:', message),
    placeholder: 'Type / for commands...',
    slashCommands: mockSlashCommands,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows slash command autocomplete when typing /. Click the "Commands" link in the bottom-right to browse all available commands.',
      },
    },
  },
};
