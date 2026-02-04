import type { Meta, StoryObj } from '@storybook/nextjs';
import { ResumeConfigModal } from '@/components/cloud-agent/ResumeConfigModal';
import type { ModelOption } from '@/components/shared/ModelCombobox';

const mockModelOptions: ModelOption[] = [
  { id: 'anthropic/claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'anthropic/claude-3-opus-20240229', name: 'Claude 3 Opus' },
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
];

const mockSession = {
  session_id: '123e4567-e89b-12d3-a456-426614174000',
  git_url: 'https://github.com/user/my-nextjs-app.git',
  title: 'Implement user authentication with NextAuth',
};

const meta: Meta<typeof ResumeConfigModal> = {
  title: 'Cloud Agent/ResumeConfigModal',
  component: ResumeConfigModal,
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
 * Default open state showing resume configuration form
 */
export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: mockSession,
    gitState: { branch: 'feature/auth' },
    modelOptions: mockModelOptions,
    isLoadingModels: false,
    defaultModel: 'anthropic/claude-3-5-sonnet-20241022',
  },
};

/**
 * With no branch information (shows "default")
 */
export const NoBranchInfo: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: mockSession,
    gitState: null,
    modelOptions: mockModelOptions,
    isLoadingModels: false,
    defaultModel: 'anthropic/claude-3-5-sonnet-20241022',
  },
};

/**
 * While models are still loading
 */
export const LoadingModels: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: mockSession,
    gitState: { branch: 'main' },
    modelOptions: [],
    isLoadingModels: true,
  },
};

/**
 * With a long session title that gets truncated
 */
export const LongSessionTitle: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      git_url: 'https://github.com/organization/very-long-repository-name-enterprise.git',
      title:
        'Fix all TypeScript errors and update all dependencies to the latest versions while ensuring backwards compatibility with existing API consumers',
    },
    gitState: { branch: 'feature/long-branch-name-that-is-very-descriptive' },
    modelOptions: mockModelOptions,
    isLoadingModels: false,
    defaultModel: 'anthropic/claude-3-5-sonnet-20241022',
  },
};

/**
 * With null session title (no title displayed)
 */
export const NoSessionTitle: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: {
      session_id: '123e4567-e89b-12d3-a456-426614174000',
      git_url: 'https://github.com/user/my-app.git',
      title: null,
    },
    gitState: { branch: 'main' },
    modelOptions: mockModelOptions,
    isLoadingModels: false,
    defaultModel: 'anthropic/claude-3-5-sonnet-20241022',
  },
};

/**
 * With pre-selected mode and model from last session usage
 */
export const WithPreselectedDefaults: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: mockSession,
    gitState: { branch: 'feature/auth' },
    modelOptions: mockModelOptions,
    isLoadingModels: false,
    defaultMode: 'architect',
    defaultModel: 'openai/gpt-4o',
  },
};

/**
 * With Architect mode showing auto-mode warning
 */
export const ArchitectModeWarning: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: mockSession,
    gitState: { branch: 'main' },
    modelOptions: mockModelOptions,
    isLoadingModels: false,
    defaultMode: 'architect',
    defaultModel: 'anthropic/claude-3-5-sonnet-20241022',
  },
};

/**
 * With Ask mode showing auto-mode warning
 */
export const AskModeWarning: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: mockSession,
    gitState: { branch: 'main' },
    modelOptions: mockModelOptions,
    isLoadingModels: false,
    defaultMode: 'ask',
    defaultModel: 'anthropic/claude-3-5-sonnet-20241022',
  },
};

/**
 * Closed state (not visible)
 */
export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: () => console.log('Modal closed'),
    onConfirm: config => console.log('Confirmed:', config),
    session: mockSession,
    gitState: { branch: 'main' },
    modelOptions: mockModelOptions,
    isLoadingModels: false,
  },
};
