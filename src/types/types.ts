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
  productType?: string;
  price: Price;
  publishedStatus?: string;
  lifecycleStatus?: string;
  isDuplicate?: boolean;
  _syncError: string;
}

export interface Order {
  sellerOrderId: string;
  originSystemOrderId: string;
  orderType: 'DOMESTIC' | 'INTERNATIONAL';
  status: string;
  orderDate: string;

  buyerInfo: BuyerInfo;

  orderLines: OrderLine[];
}

export interface BuyerInfo {
  primaryContact: {
    name: {
      firstName: string;
      lastName: string;
    };
  };
}

export interface OrderLine {
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  shippingMethod: string;
  lineId: string;

  orderLineQuantityInfo: OrderLineQuantityInfo[];

  orderProduct: {
    productName: string;
    sku: string;
  };

  orderedQty: {
    unitOfMeasure: string;
    measurementValue: number;
  };

  shipToAddress: ShipToAddress;
}

export interface OrderLineQuantityInfo {
  status: string;
  statusDescription: string;
  statusQuantity: {
    unitOfMeasure: string;
    measurementValue: number;
  };
}

export interface ShipToAddress {
  address: {
    addressLineOne: string;
    addressLineTwo?: string;
    addressType: 'RESIDENTIAL' | 'COMMERCIAL';
    city: string;
    countryCode: string;
    postalCode: string;
    stateOrProvinceName: string;
    stateOrProvinceCode: string;
  };
  name: {
    firstName: string;
    lastName: string;
    completeName: string;
  };
}

export interface ProductHistoryRow {
  date: string | Date | null;
  orderId: string | null;
  upc: string | null;
  purchase: string | number | null;
  received: string | number | null;
  lost?: string | number | null;
  sentToWfs?: string | number | null;
  costPerItem: string | number | null;
  status?: string | null;
  link?: string | null;
}
