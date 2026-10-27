import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      brand: z.string(),
      category: z.enum(['gotvarski', 'malki', 'kamani', 'poddrazhka']),
      type: z.string().optional(),
      steel: z.string().optional(),
      bladeLengthMm: z.number().int().positive().optional(),
      handle: z.string().optional(),
      weightG: z.number().int().positive().optional(),
      priceCents: z.number().int().positive(),
      stock: z.number().int().nonnegative(),
      images: z.array(image()).default([]),
      summary: z.string(),
      // Demo products. The build fails at launch (LAUNCH=1) if any are left. See src/lib/products.ts
      placeholder: z.boolean().default(false),
      addedAt: z.coerce.date(),
    }),
});

export const collections = { products };
