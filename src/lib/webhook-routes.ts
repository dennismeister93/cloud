/**
 * Gets webhook-related routes for the given context (personal or org).
 */
export function getWebhookRoutes(organizationId?: string) {
  const base = organizationId
    ? `/organizations/${organizationId}/cloud/webhooks`
    : '/cloud/webhooks';

  return {
    list: base,
    create: `${base}/new`,
    edit: (triggerId: string) => `${base}/${triggerId}`,
    requests: (triggerId: string) => `${base}/${triggerId}/requests`,
  };
}
