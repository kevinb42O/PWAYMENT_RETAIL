import { Product } from '../types';
import { BELGIAN_RETAIL_VAT_RATE } from './categories';

const vatRate = BELGIAN_RETAIL_VAT_RATE;

type SeedProduct = Omit<Product, 'id' | 'sku' | 'barcode' | 'vatRate'> & {
  costPriceCents: number;
  priceCents: number;
  barcode?: string | null;
};

const colorsByCategory: Record<string, string> = {
  skateboards: 'bg-sky-700',
  components: 'bg-zinc-700',
  footwear: 'bg-neutral-800',
  apparel: 'bg-slate-800',
  protection: 'bg-red-800',
  accessories: 'bg-violet-800',
  maintenance: 'bg-orange-700',
  services: 'bg-teal-700',
};

const skuPrefixByCategory: Record<string, string> = {
  skateboards: 'SKT',
  components: 'CMP',
  footwear: 'SHO',
  apparel: 'APP',
  protection: 'PRO',
  accessories: 'ACC',
  maintenance: 'MTN',
  services: 'SRV',
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const skuPart = (value: string) =>
  slugify(value)
    .split('-')
    .map((part) => part.slice(0, 4).toUpperCase())
    .join('-')
    .slice(0, 28);

const makeProduct = (item: SeedProduct, index: number): Product => {
  const brandPart = item.brand ? slugify(item.brand) : 'shop';
  const variantPart = item.variant ? `-${slugify(item.variant)}` : '';
  const id = `${slugify(item.category)}-${slugify(item.subCategory ?? 'general')}-${brandPart}-${slugify(item.name)}${variantPart}`;
  const prefix = skuPrefixByCategory[item.category] ?? 'SKU';
  const sku = `${prefix}-${skuPart(item.brand ?? 'HOUSE')}-${skuPart(item.name)}${item.variant ? `-${skuPart(item.variant)}` : ''}`;

  return {
    ...item,
    id,
    sku,
    barcode: item.barcode === null ? undefined : item.barcode ?? `5407001${String(index + 1).padStart(6, '0')}`,
    vatRate,
    color: item.color ?? colorsByCategory[item.category] ?? 'bg-zinc-800',
  };
};

const catalog: SeedProduct[] = [
  { name: 'Popsicle Maple Deck 8.0', category: 'skateboards', subCategory: 'Decks - Street', brand: 'Antwerp Skate Co.', supplier: 'Benelux Skate Supply', variant: '8.0 inch', costPriceCents: 3295, priceCents: 6495, stockQty: 7, minStockQty: 2 },
  { name: 'Popsicle Maple Deck 8.25', category: 'skateboards', subCategory: 'Decks - Street', brand: 'Antwerp Skate Co.', supplier: 'Benelux Skate Supply', variant: '8.25 inch', costPriceCents: 3295, priceCents: 6495, stockQty: 9, minStockQty: 3 },
  { name: 'Team Logo Deck 8.375', category: 'skateboards', subCategory: 'Decks - Street', brand: 'North Sea Skateboards', supplier: 'North Sea Distribution', variant: '8.375 inch', costPriceCents: 3695, priceCents: 7495, stockQty: 5, minStockQty: 2 },
  { name: 'Wide Street Deck 8.5', category: 'skateboards', subCategory: 'Decks - Street', brand: 'Canal Wheels & Boards', supplier: 'Canal Distribution', variant: '8.5 inch', costPriceCents: 3795, priceCents: 7695, stockQty: 4, minStockQty: 2 },
  { name: 'Pool Shape Deck 9.0', category: 'skateboards', subCategory: 'Decks - Shaped', brand: 'North Sea Skateboards', supplier: 'North Sea Distribution', variant: '9.0 inch', costPriceCents: 4295, priceCents: 8495, stockQty: 3, minStockQty: 1 },
  { name: 'Egg Shape Deck 9.125', category: 'skateboards', subCategory: 'Decks - Shaped', brand: 'Brick Lane Skate', supplier: 'UK Skate Wholesale', variant: '9.125 inch', costPriceCents: 4495, priceCents: 8995, stockQty: 3, minStockQty: 1 },
  { name: 'Cruiser Deck Fish Tail', category: 'skateboards', subCategory: 'Decks - Cruiser', brand: 'Canal Wheels & Boards', supplier: 'Canal Distribution', variant: '8.75 inch', costPriceCents: 3995, priceCents: 7995, stockQty: 4, minStockQty: 1 },
  { name: 'Old School Reissue Deck', category: 'skateboards', subCategory: 'Decks - Cruiser', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: '10 inch', costPriceCents: 4695, priceCents: 9495, stockQty: 2, minStockQty: 1 },
  { name: 'Complete Street 7.75 Junior', category: 'skateboards', subCategory: 'Completes - Junior', brand: 'Antwerp Skate Co.', supplier: 'Benelux Skate Supply', variant: '7.75 inch', costPriceCents: 5995, priceCents: 11995, stockQty: 4, minStockQty: 1 },
  { name: 'Complete Street 8.0', category: 'skateboards', subCategory: 'Completes - Street', brand: 'Antwerp Skate Co.', supplier: 'Benelux Skate Supply', variant: '8.0 inch', costPriceCents: 6495, priceCents: 12995, stockQty: 5, minStockQty: 2 },
  { name: 'Complete Street 8.25', category: 'skateboards', subCategory: 'Completes - Street', brand: 'North Sea Skateboards', supplier: 'North Sea Distribution', variant: '8.25 inch', costPriceCents: 6995, priceCents: 13995, stockQty: 4, minStockQty: 1 },
  { name: 'Complete Cruiser 28 inch', category: 'skateboards', subCategory: 'Completes - Cruiser', brand: 'Canal Wheels & Boards', supplier: 'Canal Distribution', variant: '28 inch', costPriceCents: 7495, priceCents: 14995, stockQty: 3, minStockQty: 1 },
  { name: 'Complete Surfskate', category: 'skateboards', subCategory: 'Completes - Surfskate', brand: 'Coastline Carve', supplier: 'EU Longboard Supply', variant: '31 inch', costPriceCents: 12995, priceCents: 24995, stockQty: 2, minStockQty: 1 },
  { name: 'Longboard Pintail Complete', category: 'skateboards', subCategory: 'Longboards', brand: 'Coastline Carve', supplier: 'EU Longboard Supply', variant: '40 inch', costPriceCents: 11995, priceCents: 22995, stockQty: 2, minStockQty: 1 },

  { name: 'Raw Trucks Set 139', category: 'components', subCategory: 'Trucks', brand: 'Axis Hardware', supplier: 'Hardware Hub', variant: '139 mm', costPriceCents: 3695, priceCents: 7495, stockQty: 8, minStockQty: 3 },
  { name: 'Raw Trucks Set 149', category: 'components', subCategory: 'Trucks', brand: 'Axis Hardware', supplier: 'Hardware Hub', variant: '149 mm', costPriceCents: 3995, priceCents: 7995, stockQty: 8, minStockQty: 3 },
  { name: 'Hollow Kingpin Trucks Set', category: 'components', subCategory: 'Trucks', brand: 'Axis Hardware', supplier: 'Hardware Hub', variant: '149 mm', costPriceCents: 4995, priceCents: 9995, stockQty: 5, minStockQty: 2 },
  { name: 'Surfskate Front Truck Adapter', category: 'components', subCategory: 'Trucks', brand: 'Coastline Carve', supplier: 'EU Longboard Supply', variant: 'Adapter set', costPriceCents: 5995, priceCents: 11995, stockQty: 3, minStockQty: 1 },
  { name: 'Street Wheels 52mm 99A', category: 'components', subCategory: 'Wielen - Street', brand: 'Rollfast', supplier: 'Wheelhouse Europe', variant: '52 mm 99A', costPriceCents: 1895, priceCents: 3995, stockQty: 12, minStockQty: 4, color: 'bg-emerald-700' },
  { name: 'Street Wheels 54mm 101A', category: 'components', subCategory: 'Wielen - Street', brand: 'Rollfast', supplier: 'Wheelhouse Europe', variant: '54 mm 101A', costPriceCents: 2095, priceCents: 4295, stockQty: 10, minStockQty: 4, color: 'bg-emerald-700' },
  { name: 'Conical Wheels 55mm 99A', category: 'components', subCategory: 'Wielen - Street', brand: 'Canal Wheels & Boards', supplier: 'Canal Distribution', variant: '55 mm 99A', costPriceCents: 2295, priceCents: 4695, stockQty: 8, minStockQty: 3, color: 'bg-emerald-700' },
  { name: 'Cruiser Wheels 58mm 78A', category: 'components', subCategory: 'Wielen - Cruiser', brand: 'Rollfast', supplier: 'Wheelhouse Europe', variant: '58 mm 78A', costPriceCents: 2495, priceCents: 4995, stockQty: 7, minStockQty: 2, color: 'bg-emerald-700' },
  { name: 'Soft Cruiser Wheels 60mm 80A', category: 'components', subCategory: 'Wielen - Cruiser', brand: 'Coastline Carve', supplier: 'EU Longboard Supply', variant: '60 mm 80A', costPriceCents: 2795, priceCents: 5495, stockQty: 6, minStockQty: 2, color: 'bg-emerald-700' },
  { name: 'ABEC 7 Bearings Set', category: 'components', subCategory: 'Lagers', brand: 'Rollfast', supplier: 'Wheelhouse Europe', variant: '8 pack', costPriceCents: 895, priceCents: 1995, stockQty: 18, minStockQty: 6, color: 'bg-lime-700' },
  { name: 'Swiss Precision Bearings', category: 'components', subCategory: 'Lagers', brand: 'Rollfast', supplier: 'Wheelhouse Europe', variant: '8 pack', costPriceCents: 2195, priceCents: 4495, stockQty: 9, minStockQty: 3, color: 'bg-lime-700' },
  { name: 'Ceramic Bearings Set', category: 'components', subCategory: 'Lagers', brand: 'Motion Lab', supplier: 'Hardware Hub', variant: '8 pack', costPriceCents: 3995, priceCents: 7995, stockQty: 4, minStockQty: 1, color: 'bg-lime-700' },
  { name: 'Black Griptape Sheet', category: 'components', subCategory: 'Grip', brand: 'Grip Lab', supplier: 'Hardware Hub', variant: '9 x 33 inch', costPriceCents: 395, priceCents: 995, stockQty: 30, minStockQty: 10, color: 'bg-stone-800' },
  { name: 'Clear Griptape Sheet', category: 'components', subCategory: 'Grip', brand: 'Grip Lab', supplier: 'Hardware Hub', variant: '9 x 33 inch', costPriceCents: 495, priceCents: 1195, stockQty: 10, minStockQty: 4, color: 'bg-stone-800' },
  { name: 'Graphic Griptape Skull', category: 'components', subCategory: 'Grip', brand: 'Grip Lab', supplier: 'Hardware Hub', variant: '9 x 33 inch', costPriceCents: 695, priceCents: 1495, stockQty: 8, minStockQty: 3, color: 'bg-stone-800' },
  { name: 'Allen Hardware Bolts 1 inch', category: 'components', subCategory: 'Bolts & moeren', brand: 'Axis Hardware', supplier: 'Hardware Hub', variant: '1 inch', costPriceCents: 250, priceCents: 595, stockQty: 35, minStockQty: 10 },
  { name: 'Phillips Hardware Bolts 7/8 inch', category: 'components', subCategory: 'Bolts & moeren', brand: 'Axis Hardware', supplier: 'Hardware Hub', variant: '7/8 inch', costPriceCents: 250, priceCents: 595, stockQty: 24, minStockQty: 8 },
  { name: 'Shock Pads 1/8 inch', category: 'components', subCategory: 'Risers & bushings', brand: 'Motion Lab', supplier: 'Hardware Hub', variant: '1/8 inch', costPriceCents: 295, priceCents: 695, stockQty: 16, minStockQty: 5 },
  { name: 'Cone Bushings Medium', category: 'components', subCategory: 'Risers & bushings', brand: 'Motion Lab', supplier: 'Hardware Hub', variant: 'Medium', costPriceCents: 395, priceCents: 895, stockQty: 12, minStockQty: 4 },
  { name: 'Deck Rails Set', category: 'components', subCategory: 'Rails & guards', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: 'White', costPriceCents: 695, priceCents: 1495, stockQty: 7, minStockQty: 2 },

  { name: 'Suede Low Skate Shoe Black', category: 'footwear', subCategory: 'Skateschoenen laag', brand: 'Sidewalk Supply', supplier: 'Footwear Distribution EU', variant: 'EU 40', costPriceCents: 4495, priceCents: 8995, stockQty: 2, minStockQty: 1 },
  { name: 'Suede Low Skate Shoe Black', category: 'footwear', subCategory: 'Skateschoenen laag', brand: 'Sidewalk Supply', supplier: 'Footwear Distribution EU', variant: 'EU 41', costPriceCents: 4495, priceCents: 8995, stockQty: 3, minStockQty: 1 },
  { name: 'Suede Low Skate Shoe Black', category: 'footwear', subCategory: 'Skateschoenen laag', brand: 'Sidewalk Supply', supplier: 'Footwear Distribution EU', variant: 'EU 42', costPriceCents: 4495, priceCents: 8995, stockQty: 4, minStockQty: 1 },
  { name: 'Suede Low Skate Shoe Black', category: 'footwear', subCategory: 'Skateschoenen laag', brand: 'Sidewalk Supply', supplier: 'Footwear Distribution EU', variant: 'EU 43', costPriceCents: 4495, priceCents: 8995, stockQty: 3, minStockQty: 1 },
  { name: 'Canvas Vulc Shoe Navy', category: 'footwear', subCategory: 'Skateschoenen laag', brand: 'Brick Lane Skate', supplier: 'UK Skate Wholesale', variant: 'EU 42', costPriceCents: 3495, priceCents: 6995, stockQty: 3, minStockQty: 1 },
  { name: 'Canvas Vulc Shoe Navy', category: 'footwear', subCategory: 'Skateschoenen laag', brand: 'Brick Lane Skate', supplier: 'UK Skate Wholesale', variant: 'EU 44', costPriceCents: 3495, priceCents: 6995, stockQty: 2, minStockQty: 1 },
  { name: 'Cupsole Pro Shoe White', category: 'footwear', subCategory: 'Skateschoenen cupsole', brand: 'Motion Lab', supplier: 'Footwear Distribution EU', variant: 'EU 42', costPriceCents: 5295, priceCents: 10995, stockQty: 2, minStockQty: 1 },
  { name: 'Cupsole Pro Shoe White', category: 'footwear', subCategory: 'Skateschoenen cupsole', brand: 'Motion Lab', supplier: 'Footwear Distribution EU', variant: 'EU 43', costPriceCents: 5295, priceCents: 10995, stockQty: 2, minStockQty: 1 },
  { name: 'Mid Top Skate Shoe Brown', category: 'footwear', subCategory: 'Skateschoenen mid', brand: 'Sidewalk Supply', supplier: 'Footwear Distribution EU', variant: 'EU 42', costPriceCents: 4995, priceCents: 9995, stockQty: 3, minStockQty: 1 },
  { name: 'Impact Insoles', category: 'footwear', subCategory: 'Inlegzolen', brand: 'Motion Lab', supplier: 'Footwear Distribution EU', variant: 'EU 41-42', costPriceCents: 995, priceCents: 2295, stockQty: 8, minStockQty: 3 },
  { name: 'Impact Insoles', category: 'footwear', subCategory: 'Inlegzolen', brand: 'Motion Lab', supplier: 'Footwear Distribution EU', variant: 'EU 43-44', costPriceCents: 995, priceCents: 2295, stockQty: 8, minStockQty: 3 },
  { name: 'Flat Shoe Laces Black', category: 'footwear', subCategory: 'Veters', brand: 'Sidewalk Supply', supplier: 'Footwear Distribution EU', variant: '120 cm', costPriceCents: 195, priceCents: 495, stockQty: 20, minStockQty: 6 },

  { name: 'Shop Logo T-Shirt White', category: 'apparel', subCategory: 'T-shirts', brand: 'Antwerp Skate Co.', supplier: 'Textile Print Studio', variant: 'S', costPriceCents: 995, priceCents: 2495, stockQty: 5, minStockQty: 2, color: 'bg-zinc-200 text-black' },
  { name: 'Shop Logo T-Shirt White', category: 'apparel', subCategory: 'T-shirts', brand: 'Antwerp Skate Co.', supplier: 'Textile Print Studio', variant: 'M', costPriceCents: 995, priceCents: 2495, stockQty: 8, minStockQty: 3, color: 'bg-zinc-200 text-black' },
  { name: 'Shop Logo T-Shirt White', category: 'apparel', subCategory: 'T-shirts', brand: 'Antwerp Skate Co.', supplier: 'Textile Print Studio', variant: 'L', costPriceCents: 995, priceCents: 2495, stockQty: 8, minStockQty: 3, color: 'bg-zinc-200 text-black' },
  { name: 'Back Print T-Shirt Black', category: 'apparel', subCategory: 'T-shirts', brand: 'North Sea Skateboards', supplier: 'North Sea Distribution', variant: 'M', costPriceCents: 1195, priceCents: 2995, stockQty: 6, minStockQty: 2 },
  { name: 'Back Print T-Shirt Black', category: 'apparel', subCategory: 'T-shirts', brand: 'North Sea Skateboards', supplier: 'North Sea Distribution', variant: 'L', costPriceCents: 1195, priceCents: 2995, stockQty: 6, minStockQty: 2 },
  { name: 'Heavy Logo Hoodie Black', category: 'apparel', subCategory: 'Truien & hoodies', brand: 'Antwerp Skate Co.', supplier: 'Textile Print Studio', variant: 'M', costPriceCents: 2795, priceCents: 5995, stockQty: 5, minStockQty: 2 },
  { name: 'Heavy Logo Hoodie Black', category: 'apparel', subCategory: 'Truien & hoodies', brand: 'Antwerp Skate Co.', supplier: 'Textile Print Studio', variant: 'L', costPriceCents: 2795, priceCents: 5995, stockQty: 6, minStockQty: 2 },
  { name: 'Zip Hoodie Forest', category: 'apparel', subCategory: 'Truien & hoodies', brand: 'Brick Lane Skate', supplier: 'UK Skate Wholesale', variant: 'L', costPriceCents: 3295, priceCents: 6995, stockQty: 4, minStockQty: 1 },
  { name: 'Crewneck Sweater Grey', category: 'apparel', subCategory: 'Sweaters', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: 'M', costPriceCents: 2495, priceCents: 5495, stockQty: 4, minStockQty: 1 },
  { name: 'Work Pants Loose Fit', category: 'apparel', subCategory: 'Broeken', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: '32/32', costPriceCents: 3495, priceCents: 7495, stockQty: 4, minStockQty: 1 },
  { name: 'Work Pants Loose Fit', category: 'apparel', subCategory: 'Broeken', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: '34/32', costPriceCents: 3495, priceCents: 7495, stockQty: 3, minStockQty: 1 },
  { name: 'Cargo Pants Olive', category: 'apparel', subCategory: 'Broeken', brand: 'Brick Lane Skate', supplier: 'UK Skate Wholesale', variant: 'M', costPriceCents: 3995, priceCents: 8495, stockQty: 3, minStockQty: 1 },
  { name: 'Baggy Denim Black', category: 'apparel', subCategory: 'Broeken', brand: 'Canal Wheels & Boards', supplier: 'Canal Distribution', variant: '32/30', costPriceCents: 4295, priceCents: 8995, stockQty: 3, minStockQty: 1 },
  { name: 'Chino Shorts Sand', category: 'apparel', subCategory: 'Shorts', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: 'L', costPriceCents: 2495, priceCents: 4995, stockQty: 4, minStockQty: 1 },
  { name: 'Coach Jacket Black', category: 'apparel', subCategory: 'Jassen', brand: 'North Sea Skateboards', supplier: 'North Sea Distribution', variant: 'L', costPriceCents: 3995, priceCents: 8495, stockQty: 3, minStockQty: 1 },
  { name: 'Beanie Rib Knit', category: 'apparel', subCategory: 'Mutsen & petten', brand: 'Antwerp Skate Co.', supplier: 'Textile Print Studio', variant: 'Black', costPriceCents: 795, priceCents: 1995, stockQty: 10, minStockQty: 3 },
  { name: '6 Panel Cap', category: 'apparel', subCategory: 'Mutsen & petten', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: 'Navy', costPriceCents: 995, priceCents: 2495, stockQty: 8, minStockQty: 3 },
  { name: 'Crew Socks 3 Pack', category: 'apparel', subCategory: 'Sokken', brand: 'Motion Lab', supplier: 'Textile Print Studio', variant: 'EU 39-42', costPriceCents: 695, priceCents: 1695, stockQty: 12, minStockQty: 4 },
  { name: 'Crew Socks 3 Pack', category: 'apparel', subCategory: 'Sokken', brand: 'Motion Lab', supplier: 'Textile Print Studio', variant: 'EU 43-46', costPriceCents: 695, priceCents: 1695, stockQty: 12, minStockQty: 4 },

  { name: 'Certified Helmet Matte Black', category: 'protection', subCategory: 'Helmen', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'S/M', costPriceCents: 2495, priceCents: 5495, stockQty: 4, minStockQty: 1 },
  { name: 'Certified Helmet Matte Black', category: 'protection', subCategory: 'Helmen', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'L/XL', costPriceCents: 2495, priceCents: 5495, stockQty: 4, minStockQty: 1 },
  { name: 'Knee Pads Street', category: 'protection', subCategory: 'Kniebeschermers', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'M', costPriceCents: 1995, priceCents: 4495, stockQty: 5, minStockQty: 2 },
  { name: 'Knee Pads Street', category: 'protection', subCategory: 'Kniebeschermers', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'L', costPriceCents: 1995, priceCents: 4495, stockQty: 5, minStockQty: 2 },
  { name: 'Elbow Pads Street', category: 'protection', subCategory: 'Elleboogbeschermers', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'M', costPriceCents: 1495, priceCents: 3495, stockQty: 5, minStockQty: 2 },
  { name: 'Wrist Guards', category: 'protection', subCategory: 'Polsbeschermers', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'M', costPriceCents: 1295, priceCents: 2995, stockQty: 6, minStockQty: 2 },
  { name: 'Triple Pad Set', category: 'protection', subCategory: 'Sets', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'Adult M', costPriceCents: 3495, priceCents: 7495, stockQty: 3, minStockQty: 1 },
  { name: 'Kids Protection Set', category: 'protection', subCategory: 'Sets', brand: 'Padworks', supplier: 'Safety Sports EU', variant: 'Kids', costPriceCents: 2495, priceCents: 5495, stockQty: 4, minStockQty: 1 },

  { name: 'Skate Carry Backpack', category: 'accessories', subCategory: 'Rugzakken', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: '25 L', costPriceCents: 3495, priceCents: 6995, stockQty: 5, minStockQty: 2 },
  { name: 'Board Sleeve Bag', category: 'accessories', subCategory: 'Skatetassen', brand: 'Canal Wheels & Boards', supplier: 'Canal Distribution', variant: 'Full deck', costPriceCents: 1995, priceCents: 4495, stockQty: 5, minStockQty: 2 },
  { name: 'Belt Webbing Black', category: 'accessories', subCategory: 'Riemen', brand: 'Sidewalk Supply', supplier: 'Benelux Skate Supply', variant: 'One size', costPriceCents: 695, priceCents: 1695, stockQty: 8, minStockQty: 3 },
  { name: 'Wallet Nylon', category: 'accessories', subCategory: 'Wallets', brand: 'Brick Lane Skate', supplier: 'UK Skate Wholesale', variant: 'Black', costPriceCents: 895, priceCents: 1995, stockQty: 6, minStockQty: 2 },
  { name: 'Curb Wax Block', category: 'accessories', subCategory: 'Wax', brand: 'Grip Lab', supplier: 'Hardware Hub', variant: 'Natural', costPriceCents: 250, priceCents: 695, stockQty: 20, minStockQty: 6 },
  { name: 'Colored Curb Wax', category: 'accessories', subCategory: 'Wax', brand: 'Grip Lab', supplier: 'Hardware Hub', variant: 'Red', costPriceCents: 295, priceCents: 795, stockQty: 12, minStockQty: 4 },
  { name: 'Sticker Pack Local Spots', category: 'accessories', subCategory: 'Stickers & patches', brand: 'Antwerp Skate Co.', supplier: 'Textile Print Studio', variant: '10 pack', costPriceCents: 195, priceCents: 595, stockQty: 25, minStockQty: 8 },
  { name: 'Embroidered Patch', category: 'accessories', subCategory: 'Stickers & patches', brand: 'North Sea Skateboards', supplier: 'North Sea Distribution', variant: 'Logo', costPriceCents: 250, priceCents: 695, stockQty: 18, minStockQty: 6 },
  { name: 'Gift Card', category: 'accessories', subCategory: 'Cadeaubonnen', brand: 'PWAyment Retail', supplier: 'In-house', variant: 'EUR 25', costPriceCents: 0, priceCents: 2500, stockQty: 50, minStockQty: 5, barcode: null },
  { name: 'Gift Card', category: 'accessories', subCategory: 'Cadeaubonnen', brand: 'PWAyment Retail', supplier: 'In-house', variant: 'EUR 50', costPriceCents: 0, priceCents: 5000, stockQty: 50, minStockQty: 5, barcode: null },

  { name: 'T Skate Tool', category: 'maintenance', subCategory: 'Tools', brand: 'Axis Hardware', supplier: 'Hardware Hub', variant: 'Black', costPriceCents: 695, priceCents: 1495, stockQty: 16, minStockQty: 5 },
  { name: 'Ratchet Skate Tool Pro', category: 'maintenance', subCategory: 'Tools', brand: 'Axis Hardware', supplier: 'Hardware Hub', variant: 'Pro', costPriceCents: 1495, priceCents: 2995, stockQty: 8, minStockQty: 3 },
  { name: 'Bearing Cleaner Bottle', category: 'maintenance', subCategory: 'Onderhoud', brand: 'Motion Lab', supplier: 'Hardware Hub', variant: '250 ml', costPriceCents: 795, priceCents: 1795, stockQty: 7, minStockQty: 2 },
  { name: 'Bearing Oil', category: 'maintenance', subCategory: 'Onderhoud', brand: 'Motion Lab', supplier: 'Hardware Hub', variant: '15 ml', costPriceCents: 350, priceCents: 895, stockQty: 14, minStockQty: 4 },
  { name: 'Suede Shoe Protector Spray', category: 'maintenance', subCategory: 'Schoenverzorging', brand: 'Motion Lab', supplier: 'Footwear Distribution EU', variant: '200 ml', costPriceCents: 595, priceCents: 1495, stockQty: 10, minStockQty: 3 },
  { name: 'Grip Gum Cleaner', category: 'maintenance', subCategory: 'Grip onderhoud', brand: 'Grip Lab', supplier: 'Hardware Hub', variant: 'Block', costPriceCents: 395, priceCents: 995, stockQty: 12, minStockQty: 4 },

  { name: 'Board Assembly Service', category: 'services', subCategory: 'Montage', brand: 'PWAyment Retail', supplier: 'In-house', costPriceCents: 0, priceCents: 1000, barcode: null },
  { name: 'Free Assembly With Complete', category: 'services', subCategory: 'Montage', brand: 'PWAyment Retail', supplier: 'In-house', costPriceCents: 0, priceCents: 0, barcode: null },
  { name: 'Griptape Install Service', category: 'services', subCategory: 'Montage', brand: 'PWAyment Retail', supplier: 'In-house', costPriceCents: 0, priceCents: 500, barcode: null },
  { name: 'Bearing Cleaning Service', category: 'services', subCategory: 'Onderhoud', brand: 'PWAyment Retail', supplier: 'In-house', costPriceCents: 0, priceCents: 1200, barcode: null },
  { name: 'Wheel Rotation Service', category: 'services', subCategory: 'Onderhoud', brand: 'PWAyment Retail', supplier: 'In-house', costPriceCents: 0, priceCents: 500, barcode: null },
  { name: 'Custom Complete Consultation', category: 'services', subCategory: 'Advies', brand: 'PWAyment Retail', supplier: 'In-house', costPriceCents: 0, priceCents: 1500, barcode: null },
];

export const products: Product[] = catalog.map(makeProduct);
