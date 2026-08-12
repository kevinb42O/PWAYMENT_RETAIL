import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useProducts } from '../store/useProducts';
import { WebshopSettings, useWebshopStore } from '../store/useWebshopStore';
import { Product } from '../types';
import type { Json } from '../types/database.generated';
import { resolveWebshopStoreIdentifier } from './webshopCommerce';

const jsonRecord = (value: Json | null | undefined): Record<string, Json | undefined> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, Json | undefined>
    : {};

export const loadPublicWebshop = async (): Promise<boolean> => {
  if (!isSupabaseConfigured) {
    await useProducts.getState().hydrate();
    return false;
  }

  const storeIdentifier = await resolveWebshopStoreIdentifier();
  if (!storeIdentifier) throw new Error('De webshop kon niet aan een winkel worden gekoppeld.');

  const { data, error } = await supabase.rpc('get_public_webshop', {
    store_identifier: storeIdentifier,
  });
  if (error) throw new Error(`De webshop kon niet worden geladen: ${error.message}`);

  const response = jsonRecord(data);
  const settings = jsonRecord(response.settings) as unknown as Partial<WebshopSettings>;
  const products = Array.isArray(response.products)
    ? response.products as unknown as Product[]
    : [];

  useWebshopStore.setState(settings, false);
  useProducts.setState({ list: products, hydrated: true });
  return true;
};
