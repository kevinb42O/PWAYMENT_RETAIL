import { z } from 'zod';

export const CategoryEnum = z.string().min(1);

export const SubCategoryEnum = z.string().min(1);

export const ProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: CategoryEnum,
  subCategory: SubCategoryEnum.optional(),
  sku: z.string().min(1).optional(),
  barcode: z.string().min(1).optional(),
  priceCents: z.number().int().nonnegative(),
  costPriceCents: z.number().int().nonnegative().optional(),
  vatRate: z.number().int().nonnegative(),
  brand: z.string().min(1).optional(),
  supplier: z.string().min(1).optional(),
  variant: z.string().min(1).optional(),
  stockQty: z.number().int().nonnegative().optional(),
  minStockQty: z.number().int().nonnegative().optional(),
  color: z.string().optional(),
});

export const OrderItemSchema = z.object({
  product: ProductSchema,
  quantity: z.number().int().positive(),
  notes: z.string().max(200).optional(),
});

export const PaymentMethodEnum = z.enum(['Cash', 'PIN', 'Cadeaubon', 'Split']);

export const VatBreakdownLineSchema = z.object({
  rate: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(21)]),
  grossCents: z.number().int(),
  exclCents: z.number().int(),
  vatCents: z.number().int(),
}).refine((line) => line.grossCents === line.exclCents + line.vatCents, {
  message: 'BTW-regel sluit niet aan: bruto moet exclusief plus BTW zijn.',
});

export const TransactionSchema = z.object({
  id: z.number().int().optional(),
  tableId: z.number().int(),
  items: z.array(OrderItemSchema).min(1),
  subtotalCents: z.number().int().nonnegative(),
  vatBreakdown: z.array(VatBreakdownLineSchema).max(4).optional(),
  vat12Cents: z.number().int().nonnegative(),
  vat21Cents: z.number().int().nonnegative(),
  // The commercial/VAT total is never changed by Belgian cash rounding.
  // A separate, bounded settlement difference keeps the audit trail exact.
  roundingAdjustmentCents: z.number().int().min(-2).max(2).optional(),
  totalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  paymentMethod: PaymentMethodEnum,
  timestamp: z.number().int(),
  isFinalized: z.union([z.literal(0), z.literal(1)]),
  userId: z.string().optional(),
  userName: z.string().optional(),
  customerId: z.string().optional(),
});

export const PaymentTotalsSchema = z.object({
  Cash: z.number().int().nonnegative(),
  PIN: z.number().int().nonnegative(),
  Cadeaubon: z.number().int().nonnegative(),
});

export const DailyReportSchema = z.object({
  id: z.number().int().optional(),
  reportNumber: z.number().int().positive(),
  timestamp: z.number().int(),
  totalRevenueCents: z.number().int().nonnegative(),
  totalCostCents: z.number().int().nonnegative(),
  grossProfitCents: z.number().int(),
  totalVat12Cents: z.number().int().nonnegative(),
  totalVat21Cents: z.number().int().nonnegative(),
  totalExclVat12Cents: z.number().int().nonnegative(),
  totalExclVat21Cents: z.number().int().nonnegative(),
  totalVatBreakdown: z.array(VatBreakdownLineSchema).max(4).optional(),
  totalDiscountCents: z.number().int().nonnegative(),
  totalCashRoundingAdjustmentCents: z.number().int().optional(),
  paymentTotalsCents: PaymentTotalsSchema,
  transactionIds: z.array(z.number().int()),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  prevHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  closedByUserId: z.string().optional(),
  closedByUserName: z.string().optional(),
});

export const RoleEnum = z.enum(['owner', 'manager', 'cashier']);

export const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: RoleEnum,
  pinHash: z.string().regex(/^[0-9a-f]{64}$/),
});
