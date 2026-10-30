// English names for the admin. The storefront's Bulgarian names stay in src/i18n/bg.ts.
import type { Category, ProductStatus } from './catalog';

export const categoryLabel: Record<Category, string> = {
  gotvarski: 'Chef’s knives',
  malki: 'Small and utility knives',
  kamani: 'Sharpening stones',
  poddrazhka: 'Care and accessories',
};

export const productStatusLabel: Record<ProductStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};
