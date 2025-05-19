interface Price {
  currency?: string;
  amount?: number;
}

export interface Product {
  mart?: string;
  sku?: string;
  condition?: string;
  availability?: string;
  wpid?: string;
  upc?: string;
  gtin?: string;
  productName?: string;
  shelf?: string[];
  productType?: string;
  price?: Price;
  publishedStatus?: string;
  lifecycleStatus?: string;
  isDuplicate?: boolean;
}
