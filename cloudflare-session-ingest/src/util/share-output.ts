import { z } from 'zod';
import type { SessionDataItem } from '../types/session-sync';

export const SharedSessionSnapshotSchema = z.object({
  info: z.unknown(),
  messages: z.array(
    z.looseObject({
      info: z.looseObject({
        id: z.string(),
      }),
      parts: z.array(
        z.looseObject({
          id: z.string(),
        })
      ),
    })
  ),
});

export type SharedSessionSnapshot = z.infer<typeof SharedSessionSnapshotSchema>;

export function buildSharedSessionSnapshot(items: SessionDataItem[]) {
  const out: SharedSessionSnapshot = {
    info: {},
    messages: [],
  };

  const messagesById = new Map<string, SharedSessionSnapshot['messages'][number]>();
  const partsByMessageID = new Map<string, Array<{ id: string }>>();

  for (const item of items) {
    const itemType = item.type;

    switch (itemType) {
      case 'session': {
        out.info = item.data;
        break;
      }
      case 'message': {
        const data = item.data as { id: string };
        const msg: SharedSessionSnapshot['messages'][number] = {
          info: data,
          parts: [],
        };

        const pending = partsByMessageID.get(data.id);
        if (pending?.length) {
          msg.parts.push(...pending);
          partsByMessageID.delete(data.id);
        }

        out.messages.push(msg);
        messagesById.set(data.id, msg);
        break;
      }
      case 'part': {
        const data = item.data as { id: string; messageID: string };
        const msg = messagesById.get(data.messageID);
        if (msg) {
          msg.parts.push(data);
          break;
        }

        const pending = partsByMessageID.get(data.messageID) ?? [];
        pending.push(data);
        partsByMessageID.set(data.messageID, pending);
        break;
      }
      // TODO: leave 'model' and 'session_diff' for later
      default: {
        break;
      }
    }
  }

  return out;
}
