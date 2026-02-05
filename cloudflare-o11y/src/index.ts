import { Hono } from 'hono';
import { z } from 'zod';
import { zodJsonValidator } from './util/validation';

const app = new Hono();

const ApiMetricsParamsSchema = z
	.object({
		clientName: z.string().min(1),
		clientSecret: z.string().min(1),
		provider: z.string().min(1),
		requestedModel: z.string().min(1),
		resolvedModel: z.string().min(1),
		toolsAvailable: z.array(z.string().min(1)),
		toolsUsed: z.array(z.string().min(1)),
		ttfbMs: z.number().int().nonnegative(),
		completeRequestMs: z.number().int().nonnegative(),
		statusCode: z.number().int().min(100).max(599),
		success: z.boolean(),
		errorMessage: z.string().optional(),
		tokens: z
			.object({
				inputTokens: z.number().int().nonnegative().optional(),
				outputTokens: z.number().int().nonnegative().optional(),
				cacheWriteTokens: z.number().int().nonnegative().optional(),
				cacheHitTokens: z.number().int().nonnegative().optional(),
				totalTokens: z.number().int().nonnegative().optional(),
			})
			.optional(),
	})
	.superRefine((value, ctx) => {
		if (value.success) return;
		if (value.errorMessage && value.errorMessage.trim().length > 0) return;

		ctx.addIssue({
			code: 'custom',
			path: ['errorMessage'],
			message: 'errorMessage is required when success=false',
		});
	});

app.get('/', (c) => c.text('Hello World!'));

app.post('/ingest/api-metrics', zodJsonValidator(ApiMetricsParamsSchema), async (c) => {
	c.req.valid('json');

	// TODO(phase-1a): emit/forward metrics to storage/analytics backend.
	return c.body(null, 204);
});

export default app;
