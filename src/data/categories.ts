import { ProductCategory } from '../types';

export const BELGIAN_RETAIL_VAT_RATE = 21;

export const productCategories: ProductCategory[] = [
  { id: 'skateboards', name: 'Skateboards', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 10, isActive: true },
  { id: 'components', name: 'Onderdelen', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 20, isActive: true },
  { id: 'footwear', name: 'Schoenen', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 30, isActive: true },
  { id: 'apparel', name: 'Kledij', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 40, isActive: true },
  { id: 'protection', name: 'Protectie', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 50, isActive: true },
  { id: 'accessories', name: 'Accessoires', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 60, isActive: true },
  { id: 'maintenance', name: 'Tools & onderhoud', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 70, isActive: true },
  { id: 'services', name: 'Services', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 80, isActive: true },
];