import type { Meta, StoryObj } from '@storybook/nextjs';
import { ToolExecutionCard } from '@/components/cloud-agent/ToolExecutionCard';
import type { ToolExecution } from '@/components/cloud-agent/types';

const meta: Meta<typeof ToolExecutionCard> = {
  title: 'Cloud Agent/ToolExecutionCard',
  component: ToolExecutionCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date().toISOString();

const runningExecution: ToolExecution = {
  toolName: 'execute_command',
  input: { command: 'npm install', cwd: '/workspace' },
  timestamp: now,
};

const completeExecution: ToolExecution = {
  toolName: 'read_file',
  input: { path: 'src/components/Button.tsx' },
  output:
    'import React from "react";\n\nexport function Button({ children, onClick }) {\n  return <button onClick={onClick}>{children}</button>;\n}',
  timestamp: now,
};

const errorExecution: ToolExecution = {
  toolName: 'write_to_file',
  input: { path: 'src/test.ts', content: 'export const test = true;' },
  error: 'Error: Permission denied. Cannot write to protected directory.',
  timestamp: now,
};

const longOutputExecution: ToolExecution = {
  toolName: 'list_files',
  input: { path: 'src/', recursive: true },
  output: `src/
src/components/
src/components/Button.tsx
src/components/Card.tsx
src/components/Input.tsx
src/components/Modal.tsx
src/components/Navbar.tsx
src/components/Footer.tsx
src/lib/
src/lib/auth.ts
src/lib/database.ts
src/lib/utils.ts
src/lib/api.ts
src/pages/
src/pages/index.tsx
src/pages/about.tsx
src/pages/dashboard.tsx
src/pages/settings.tsx
src/styles/
src/styles/globals.css
src/styles/components.css
And many more files...`,
  timestamp: now,
};

export const Running: Story = {
  args: {
    execution: runningExecution,
  },
};

export const Complete: Story = {
  args: {
    execution: completeExecution,
  },
};

export const Error: Story = {
  args: {
    execution: errorExecution,
  },
};

export const LongOutput: Story = {
  args: {
    execution: longOutputExecution,
  },
};
