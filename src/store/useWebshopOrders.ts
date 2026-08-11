import { create } from 'zustand';
import { UpdateWebshopOrderInput, webshopCommerce } from '../services/webshopCommerce';
import { WebshopOrder } from '../types';
import { useProducts } from './useProducts';

interface WebshopOrdersState {
  orders: WebshopOrder[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateOrder: (id: string, update: UpdateWebshopOrderInput) => Promise<WebshopOrder>;
}

export const useWebshopOrders = create<WebshopOrdersState>((set) => ({
  orders: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      set({ orders: await webshopCommerce.listOrders(), loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Bestellingen konden niet worden geladen.', loading: false });
    }
  },

  updateOrder: async (id, update) => {
    set({ error: null });
    try {
      const result = await webshopCommerce.updateOrder(id, update);
      useProducts.getState().syncPersisted(result.updatedProducts);
      set((state) => ({
        orders: state.orders.map((order) => (order.id === id ? result.order : order)),
      }));
      return result.order;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'De bestelling kon niet worden bijgewerkt.';
      set({ error: message });
      throw error;
    }
  },
}));
