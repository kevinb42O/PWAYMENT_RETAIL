import { ProductCategory } from '../types';

export const BELGIAN_RETAIL_VAT_RATE = 21;

export const productCategories: ProductCategory[] = [
  { id: 'skateboards', name: 'Skateboards', icon: 'rocket', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 10, isActive: true },
  { id: 'components', name: 'Onderdelen', icon: 'wrench', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 20, isActive: true },
  { id: 'footwear', name: 'Schoenen', icon: 'shopping-bag', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 30, isActive: true },
  { id: 'apparel', name: 'Kledij', icon: 'shirt', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 40, isActive: true },
  { id: 'protection', name: 'Protectie', icon: 'hard-hat', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 50, isActive: true },
  { id: 'accessories', name: 'Accessoires', icon: 'tag', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 60, isActive: true },
  { id: 'maintenance', name: 'Tools & onderhoud', icon: 'wrench', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 70, isActive: true },
  { id: 'services', name: 'Services', icon: 'headphones', vatRate: BELGIAN_RETAIL_VAT_RATE, sortOrder: 80, isActive: true },
];
