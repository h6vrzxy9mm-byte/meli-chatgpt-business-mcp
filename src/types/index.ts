export type ListingType = 'gold_special' | 'gold_pro';

export interface Costs {
  saleFee: number;
  fixedFee: number;
  financing: number;
  shipping: number;
  other: number;
  unknown: string[];
}

export interface SaleEstimate {
  publishedPrice: number;
  costs: Costs;
  totalCharges: number;
  net: number;
  productCost?: number;
  profit?: number;
  marginPercent?: number;
}

export interface Comparable {
  id: string;
  title: string;
  price: number;
  permalink?: string;
  categoryId?: string;
  condition?: string;
  listingTypeId?: string;
  freeShipping?: boolean;
  installments?: number | null;
  soldQuantity?: number;
  sellerReputation?: string | null;
  attributes?: Array<{ id: string; value_name?: string }>;
  relevanceScore: number;
}

export interface ListingDraft {
  title: string;
  category_id: string;
  price: number;
  currency_id: 'ARS';
  available_quantity: number;
  buying_mode: 'buy_it_now';
  listing_type_id: ListingType;
  attributes: Array<{ id: string; value_name?: string; value_id?: string }>;
  pictures: Array<{ source?: string; id?: string }>;
  shipping: { mode: 'me2'; free_shipping: boolean; local_pick_up?: boolean };
  description?: { plain_text: string };
  family_name?: string;
}
