/**
 * Zod validation schemas for API requests
 */

import { z } from 'zod';
import { AttributionsMetadataInput } from './db/tables/attributions_metadata.table';
import { LinesAddedRecord } from './db/tables/lines_added.table';
import { LinesRemovedRecord } from './db/tables/lines_removed.table';

export type AttributionsTrackRequestBody = z.infer<typeof AttributionsTrackRequestBody>;
export const AttributionsTrackRequestBody = z.object({
  project_id: AttributionsMetadataInput.shape.project_id,
  branch: AttributionsMetadataInput.shape.branch,
  file_path: AttributionsMetadataInput.shape.file_path,
  status: AttributionsMetadataInput.shape.status,
  task_id: AttributionsMetadataInput.shape.task_id,
  lines_added: z
    .object({
      line_number: LinesAddedRecord.shape.line_number,
      line_hash: LinesAddedRecord.shape.line_hash,
    })
    .array(),
  lines_removed: z
    .object({
      line_number: LinesRemovedRecord.shape.line_number,
      line_hash: LinesRemovedRecord.shape.line_hash,
    })
    .array(),
});

export type OrganizationJWTPayload = z.infer<typeof OrganizationJWTPayload>;
export const OrganizationJWTPayload = z.object({
  version: z.literal(3),
  kiloUserId: z.string(),
  organizationId: z.string(),
  organizationRole: z.enum(['owner', 'member']),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

// Admin endpoint query params for fetching attributions
export type AdminAttributionsQueryParams = z.infer<typeof AdminAttributionsQueryParams>;
export const AdminAttributionsQueryParams = z.object({
  organization_id: z.string().min(1),
  project_id: z.string().min(1),
  file_path: z.string().min(1),
  branch: z.string().min(1).optional(),
});

// Response schema for attribution events (used by flexible retention)
export type AttributionEventResponse = z.infer<typeof AttributionEventResponse>;
export const AttributionEventResponse = z.object({
  id: z.number(),
  taskId: z.string().nullable(),
  lineHashes: z.array(z.string()),
});

// Admin endpoint params for deleting a single attribution
export type AdminDeleteAttributionParams = z.infer<typeof AdminDeleteAttributionParams>;
export const AdminDeleteAttributionParams = z.object({
  organization_id: z.string().min(1),
  project_id: z.string().min(1),
  file_path: z.string().min(1),
  attribution_id: z.coerce.number().int().positive(),
});
