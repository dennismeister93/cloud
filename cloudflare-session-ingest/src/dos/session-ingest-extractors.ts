import type { IngestBatch } from '../types/session-sync';

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function extractNormalizedTitleFromItem(
  item: IngestBatch[number]
): string | null | undefined {
  if (item.type !== 'session') return undefined;
  return normalizeOptionalString((item.data as { title?: unknown } | null | undefined)?.title);
}

export function extractNormalizedParentIdFromItem(
  item: IngestBatch[number]
): string | null | undefined {
  if (item.type !== 'session') return undefined;
  return normalizeOptionalString(
    (item.data as { parentID?: unknown } | null | undefined)?.parentID
  );
}

export function extractNormalizedPlatformFromItem(
  item: IngestBatch[number]
): string | null | undefined {
  if (item.type !== 'kilo_meta') return undefined;
  return normalizeOptionalString(
    (item.data as { platform?: unknown } | null | undefined)?.platform
  );
}

export function extractNormalizedOrgIdFromItem(
  item: IngestBatch[number]
): string | null | undefined {
  if (item.type !== 'kilo_meta') return undefined;
  return normalizeOptionalString((item.data as { orgId?: unknown } | null | undefined)?.orgId);
}
