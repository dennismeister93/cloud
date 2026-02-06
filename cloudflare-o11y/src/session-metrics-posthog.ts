import type { SessionMetricsParams } from './session-metrics-schema';

export function captureSessionMetrics(params: SessionMetricsParams, env: Env): Promise<Response> {
	const { ipAddress, ...properties } = params;

	return fetch(`${env.POSTHOG_HOST}/capture/`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			api_key: env.POSTHOG_API_KEY,
			event: 'o11y_session_metrics',
			distinct_id: params.kiloUserId,
			// Forward the user's real IP so PostHog resolves GeoIP correctly
			...(ipAddress ? { ip: ipAddress } : {}),
			properties: {
				...properties,
				$process_person_profile: true,
			},
		}),
	});
}
