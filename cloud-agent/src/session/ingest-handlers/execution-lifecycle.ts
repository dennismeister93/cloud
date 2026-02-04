export type ExecutionStatus = 'completed' | 'failed' | 'interrupted';

export type ExecutionLifecycleContext = {
  updateExecutionStatus: (
    executionId: string,
    status: ExecutionStatus,
    error?: string
  ) => Promise<void>;
  clearActiveExecution: () => Promise<void>;
  advanceQueue: () => Promise<void>;
  logger: { info: (msg: string, data?: object) => void };
};

/**
 * Handle execution completion - update status, clear active execution, and advance queue.
 */
export async function handleExecutionComplete(
  executionId: string,
  status: ExecutionStatus,
  ctx: ExecutionLifecycleContext,
  error?: string
): Promise<void> {
  ctx.logger.info('Execution complete', { executionId, status, error });

  // Update the execution status and completedAt in storage
  await ctx.updateExecutionStatus(executionId, status, error);

  await ctx.clearActiveExecution();
  await ctx.advanceQueue();
}
