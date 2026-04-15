export type PublicFormFieldKey = string;

export interface PublicFormField {
  key: PublicFormFieldKey;
  label: string;
  section: 'purchase' | 'sale' | 'remortgage' | 'additional' | 'common';
}

export const PUBLIC_FORM_FIELDS: PublicFormField[] = [
  // Purchase fields
  { key: 'purchase.property_postcode', label: 'Property Postcode (Purchase)', section: 'purchase' },
  { key: 'purchase.purchase_price', label: 'Purchase Price', section: 'purchase' },
  { key: 'purchase.tenure', label: 'Tenure (Purchase)', section: 'purchase' },
  { key: 'purchase.is_newbuild', label: 'New Build', section: 'purchase' },
  { key: 'purchase.is_shared_ownership', label: 'Shared Ownership (Purchase)', section: 'purchase' },
  { key: 'purchase.has_mortgage', label: 'Mortgage Required', section: 'purchase' },
  { key: 'purchase.is_first_time_buyer', label: 'First Time Buyer', section: 'purchase' },
  { key: 'purchase.buyer_count', label: 'Number of Buyers', section: 'purchase' },
  { key: 'purchase.gifted_deposit', label: 'Gifted Deposit', section: 'purchase' },
  { key: 'purchase.uses_help_to_buy_isa', label: 'Help to Buy ISA', section: 'purchase' },
  { key: 'purchase.uses_right_to_buy', label: 'Right to Buy', section: 'purchase' },
  { key: 'purchase.uses_help_to_buy_equity_loan', label: 'Help to Buy Equity Loan', section: 'purchase' },
  // Sale fields
  { key: 'sale.property_postcode', label: 'Property Postcode (Sale)', section: 'sale' },
  { key: 'sale.sale_price', label: 'Sale Price', section: 'sale' },
  { key: 'sale.tenure', label: 'Tenure (Sale)', section: 'sale' },
  { key: 'sale.has_existing_mortgage', label: 'Existing Mortgage', section: 'sale' },
  { key: 'sale.is_shared_ownership', label: 'Shared Ownership (Sale)', section: 'sale' },
  { key: 'sale.seller_count', label: 'Number of Sellers', section: 'sale' },
  // Remortgage fields
  { key: 'remortgage.property_postcode', label: 'Property Postcode (Remortgage)', section: 'remortgage' },
  { key: 'remortgage.remortgage_property_value', label: 'Remortgage Property Value', section: 'remortgage' },
  { key: 'remortgage.tenure', label: 'Tenure (Remortgage)', section: 'remortgage' },
  { key: 'remortgage.is_buy_to_let', label: 'Buy to Let (Remortgage)', section: 'remortgage' },
  { key: 'remortgage.transfer_of_equity', label: 'Transfer of Equity', section: 'remortgage' },
  { key: 'remortgage.remortgagor_count', label: 'Number of Remortgagors', section: 'remortgage' },
  { key: 'remortgage.recommend_mortgage_broker', label: 'Recommend Mortgage Broker', section: 'remortgage' },
  // Additional fields
  { key: 'additional.buy_to_let', label: 'Buy to Let', section: 'additional' },
  { key: 'additional.second_home', label: 'Second Home', section: 'additional' },
  { key: 'additional.company_purchase', label: 'Company Purchase', section: 'additional' },
  { key: 'additional.auction_purchase', label: 'Auction Purchase', section: 'additional' },
  { key: 'additional.probate_related', label: 'Probate Related', section: 'additional' },
  { key: 'additional.speed_essential', label: 'Urgency Essential', section: 'additional' },
  { key: 'additional.full_address', label: 'Full Address', section: 'additional' },
  { key: 'additional.lender_name', label: 'Lender Name', section: 'additional' },
  { key: 'additional.source_of_funds_notes', label: 'Source of Funds Notes', section: 'additional' },
  { key: 'additional.chain_related_notes', label: 'Chain Related Notes', section: 'additional' },
  // Common fields
  { key: 'common.instruct_timeline', label: 'Instruct Timeline', section: 'common' },
  { key: 'common.special_instructions', label: 'Special Instructions', section: 'common' },
];
