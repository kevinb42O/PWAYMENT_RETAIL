export type InventorySignalFilter = "out" | "low";

type StockSignalProduct = {
  stockQty?: number | null;
  minStockQty?: number | null;
};

export const matchesInventorySignal = (
  product: StockSignalProduct,
  signal: InventorySignalFilter,
) => signal === "out"
  ? product.stockQty === 0
  : product.stockQty != null
    && product.stockQty > 0
    && product.minStockQty != null
    && product.stockQty <= product.minStockQty;
