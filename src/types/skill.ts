/**
 * Type definitions for Skills Marketplace items
 *
 * These types define the structure of skills data that will be served
 * from the Skills Marketplace API and displayed in the UI.
 */

import { z } from 'zod';

/**
 * Repository metadata for a skill
 */
export const repositorySchema = z.object({
  fullName: z.string(),
  stars: z.number(),
  forks: z.number(),
  url: z.string(),
  updatedAt: z.string(),
});

export type Repository = z.infer<typeof repositorySchema>;

/**
 * A single skill in the marketplace
 */
export const skillSchema = z.object({
  // Core identity
  id: z.string(),
  name: z.string(),
  description: z.string(),

  // Attribution
  author: z.string().nullable(),

  // Categorization
  category: z.string(),
  tags: z.array(z.string()),

  // Repository metadata
  repository: repositorySchema,

  // Download/View URLs
  githubUrl: z.string(),
  rawUrl: z.string(),
});

export type Skill = z.infer<typeof skillSchema>;

/**
 * Container for all skills (the JSON output format)
 */
export const skillsIndexSchema = z.object({
  skills: z.array(skillSchema),
  generatedAt: z.string(),
  sourceRepo: z.string(),
});

export type SkillsIndex = z.infer<typeof skillsIndexSchema>;
