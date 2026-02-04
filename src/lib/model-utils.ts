/**
 * Shared model utilities that can be used on both client and server.
 * Keep this file free of server-only dependencies.
 */

/**
 * Normalize a model ID by removing the `:free` suffix if present.
 */
export function normalizeModelId(modelId: string): string {
  return modelId.endsWith(':free')
    ? modelId.substring(0, modelId.length - ':free'.length)
    : modelId;
}
