import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    topics: z.array(z.enum(['charging', 'camera', 'display_tp', 'audio', 'sensor'])).default([]),
    visibility: z.enum(['public', 'private', 'draft']).default('public'),
    status: z.enum(['整理中', '已验证', '待验证', '未完成', '废弃']).default('整理中'),
    date: z.coerce.date(),
    updated: z.coerce.date(),
  }),
});

export const collections = { docs };
