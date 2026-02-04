import { describe, expect, it, vi } from 'vitest';

import type { IngestBatch } from '../types/session-sync';

type IngestLimitsModule = {
  MAX_INGEST_ITEM_BYTES: number;
  MAX_DO_INGEST_CHUNK_BYTES: number;
  byteLengthUtf8: (text: string) => number;
};

function byteLengthUtf8(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function chunkBytes(chunk: IngestBatch): number {
  let bytes = 2;
  for (const item of chunk) {
    bytes += byteLengthUtf8(JSON.stringify(item)) + 1;
  }
  return bytes;
}

async function loadSplitWithLimits(limits: {
  MAX_INGEST_ITEM_BYTES: number;
  MAX_DO_INGEST_CHUNK_BYTES: number;
}) {
  vi.resetModules();
  vi.doMock('./ingest-limits', async () => {
    const actual = await vi.importActual<IngestLimitsModule>('./ingest-limits');
    return {
      ...actual,
      MAX_INGEST_ITEM_BYTES: limits.MAX_INGEST_ITEM_BYTES,
      MAX_DO_INGEST_CHUNK_BYTES: limits.MAX_DO_INGEST_CHUNK_BYTES,
    };
  });

  const mod = await import('./ingest-batching');
  return mod.splitIngestBatchForDO;
}

describe('splitIngestBatchForDO', () => {
  it('drops items whose size exceeds MAX_INGEST_ITEM_BYTES', async () => {
    const splitIngestBatchForDO = await loadSplitWithLimits({
      MAX_INGEST_ITEM_BYTES: 100,
      MAX_DO_INGEST_CHUNK_BYTES: 10_000,
    });

    const items: IngestBatch = [
      { type: 'message', data: { id: 'm1', text: 'x'.repeat(500) } },
      { type: 'message', data: { id: 'm2', text: 'ok' } },
    ];

    const res = splitIngestBatchForDO(items);
    expect(res.droppedOversizeItems).toBe(1);
    expect(res.chunks.flat()).toEqual([{ type: 'message', data: { id: 'm2', text: 'ok' } }]);
  });

  it('splits items into multiple chunks when MAX_DO_INGEST_CHUNK_BYTES is reached', async () => {
    const MAX_DO_INGEST_CHUNK_BYTES = 180;
    const splitIngestBatchForDO = await loadSplitWithLimits({
      MAX_INGEST_ITEM_BYTES: 10_000,
      MAX_DO_INGEST_CHUNK_BYTES,
    });

    const items: IngestBatch = Array.from({ length: 6 }, (_, i) => ({
      type: 'message',
      data: { id: `m${i + 1}`, text: 'x'.repeat(20) },
    }));

    const res = splitIngestBatchForDO(items);
    expect(res.droppedOversizeItems).toBe(0);
    expect(res.chunks.length).toBeGreaterThan(1);
    expect(res.chunks.flat()).toEqual(items);
    for (const chunk of res.chunks) {
      expect(chunkBytes(chunk)).toBeLessThanOrEqual(MAX_DO_INGEST_CHUNK_BYTES);
    }
  });
});
