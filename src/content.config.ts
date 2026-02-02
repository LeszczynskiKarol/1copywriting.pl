import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.date(),
    updatedDate: z.date().optional(),
    author: z.string().default('Redakcja 1copywriting.pl'),
    category: z.string(),
    silo: z.string(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    draft: z.boolean().default(false),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    readingTime: z.number().optional(),
    keyword: z.string(),
    relatedPosts: z.array(z.string()).default([]),
  }),
});

export const collections = {
  blog: blogCollection,
};
