// interface Price {
//   currency?: string;
//   amount?: number;
// }

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
  price: {
    currency?: string;
    amount: number;
  };
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
  picture: string | null;
  orderId: string | null;
  link: string | null;
  purchase: string | number | null;
  received: string | number | null;
  lostDamaged: string | number | null;
  sentToWfs: string | number | null;
  remaining: string | number | null;
  costPerItem: string | number | null;
  totalCost: string | number | null;
  sentToWfsCost: string | number | null;
  remainingCost: string | number | null;
  status: string | null;
  upc: string | null;
  wfsStatus: string | null;
}
