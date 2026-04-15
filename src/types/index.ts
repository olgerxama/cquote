// Service types
export type ServiceType = 'purchase' | 'sale' | 'sale_purchase' | 'remortgage';
export type Tenure = 'freehold' | 'leasehold';
export type YesNo = 'yes' | 'no';
export type YesNoNotSure = 'yes' | 'no' | 'not_sure';
export type ItemType = 'fee' | 'extra' | 'disbursement' | 'discount' | 'manual';
export type QuoteItemSourceType = 'band' | 'extra_auto' | 'extra_manual' | 'discount_code' | 'manual';
export type QuoteStatus = 'new' | 'draft' | 'sent' | 'accepted' | 'expired';
export type LeadStatus = 'new' | 'review' | 'quoted';

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  sale_purchase: 'Sale & Purchase',
  remortgage: 'Remortgage',
};

export const QUOTE_STATUSES: QuoteStatus[] = ['new', 'draft', 'sent', 'accepted', 'expired'];

export const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-green-100 text-green-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-red-100 text-red-800',
};

export const TIMELINE_OPTIONS = [
  { value: 'asap', label: 'As soon as possible' },
  { value: '1_month', label: 'Within 1 month' },
  { value: '1_3_months', label: '1-3 months' },
  { value: '3_6_months', label: '3-6 months' },
  { value: 'not_sure', label: 'Not sure yet' },
];

// Database entity types
export interface Firm {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  disclaimer_text: string | null;
  created_at: string;
  updated_at: string;
  plan_type: 'free' | 'professional';
  show_instant_quote: boolean;
  show_estimate_document: boolean;
  require_admin_review: boolean;
  public_quote_form_enabled: boolean;
  is_active: boolean;
  admin_notes: string | null;
  disclaimer_purchase: string | null;
  disclaimer_sale: string | null;
  disclaimer_remortgage: string | null;
  manual_review_conditions: ManualReviewCondition[];
  reply_to_email: string | null;
  sender_display_name: string | null;
  owner_user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  stripe_subscription_current_period_end: string | null;
  stripe_subscription_cancel_at_period_end: boolean;
  public_form_config: PublicFormConfig;
  auto_send_quote_emails: boolean;
}

export interface FirmUser {
  id: string;
  user_id: string;
  firm_id: string;
  role: 'admin' | 'read_only';
  created_at: string;
  email?: string | null;
}

export interface PricingBand {
  id: string;
  firm_id: string;
  service_type: string;
  min_value: number;
  max_value: number;
  base_fee: number;
  created_at: string;
  updated_at: string;
}

export interface PricingExtra {
  id: string;
  firm_id: string;
  name: string;
  condition_field: string | null;
  condition_value: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
  apply_mode: 'automatic' | 'manual_optional';
  vat_applicable: boolean;
  is_active: boolean;
  trigger_operator: 'equals' | 'not_equals';
  service_type: string | null;
}

export interface Lead {
  id: string;
  firm_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  service_type: string;
  property_value: number;
  tenure: string;
  mortgage_required: boolean;
  first_time_buyer: boolean;
  estimated_total: number | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
  answers: Record<string, unknown>;
  discount_code_id: string | null;
  first_name: string | null;
  surname: string | null;
  instruction_submitted_at: string | null;
}

export interface Quote {
  id: string;
  lead_id: string;
  firm_id: string;
  status: QuoteStatus;
  subtotal: number;
  vat_total: number;
  grand_total: number;
  discount_total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  document_type: 'estimate' | 'invoice' | null;
  sent_at: string | null;
  document_generated_at: string | null;
  document_downloaded_at: string | null;
  reference_code: string | null;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  description: string;
  amount: number;
  is_vatable: boolean;
  sort_order: number;
  created_at: string;
  item_type: ItemType;
  source_type: QuoteItemSourceType;
  source_reference_id: string | null;
  is_manual: boolean;
  is_discount: boolean;
}

export interface DiscountCode {
  id: string;
  firm_id: string;
  code: string;
  description: string | null;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
  updated_at: string;
}

// Form data types
export interface PurchaseAnswers {
  property_postcode: string;
  purchase_price: string;
  tenure: Tenure;
  is_newbuild: YesNo;
  is_shared_ownership: YesNo;
  has_mortgage: YesNo;
  is_first_time_buyer: YesNo;
  buyer_count: number;
  gifted_deposit: YesNoNotSure;
  uses_help_to_buy_isa: YesNo;
  uses_right_to_buy: YesNo;
  uses_help_to_buy_equity_loan: YesNo;
}

export interface SaleAnswers {
  property_postcode: string;
  sale_price: string;
  tenure: Tenure;
  has_existing_mortgage: YesNo;
  is_shared_ownership: YesNo;
  seller_count: number;
}

export interface RemortgageAnswers {
  property_postcode: string;
  remortgage_property_value: string;
  tenure: Tenure;
  is_buy_to_let: YesNo;
  transfer_of_equity: YesNo;
  remortgagor_count: number;
  recommend_mortgage_broker: YesNo;
}

export interface AdditionalInfo {
  buy_to_let: YesNo;
  second_home: YesNo;
  company_purchase: YesNo;
  auction_purchase: YesNo;
  probate_related: YesNo;
  speed_essential: YesNo;
  full_address: string;
  lender_name: string;
  source_of_funds_notes: string;
  chain_related_notes: string;
}

export interface CommonAnswers {
  instruct_timeline: string;
  special_instructions: string;
}

export interface ContactInfo {
  first_name: string;
  surname: string;
  email: string;
  phone: string;
}

export interface QuoteFormData {
  serviceType: ServiceType;
  purchase: PurchaseAnswers;
  sale: SaleAnswers;
  remortgage: RemortgageAnswers;
  additional: AdditionalInfo;
  common: CommonAnswers;
  contact: ContactInfo;
}

export interface QuoteLineItem {
  description: string;
  amount: number;
  is_vatable: boolean;
  item_type: ItemType;
  source_type: QuoteItemSourceType;
  source_reference_id?: string | null;
  sort_order: number;
  is_manual?: boolean;
  is_discount?: boolean;
}

export interface QuoteBreakdown {
  items: QuoteLineItem[];
  subtotal: number;
  discountTotal: number;
  vatableTotal: number;
  vatAmount: number;
  grandTotal: number;
}

export interface ManualReviewCondition {
  field: string;
  value: string;
}

export interface PublicFormConfig {
  show_service_selector: boolean;
  show_sale_section: boolean;
  show_purchase_section: boolean;
  show_remortgage_section: boolean;
  show_additional_info: boolean;
  show_timeline_notes: boolean;
  show_phone_field: boolean;
  show_discount_code: boolean;
  show_instruct_button: boolean;
  hidden_fields: string[];
  required_fields: string[];
  instruction_hidden_fields: string[];
  instruction_required_fields: string[];
}

export const DEFAULT_PUBLIC_FORM_CONFIG: PublicFormConfig = {
  show_service_selector: true,
  show_sale_section: true,
  show_purchase_section: true,
  show_remortgage_section: true,
  show_additional_info: true,
  show_timeline_notes: true,
  show_phone_field: true,
  show_discount_code: true,
  show_instruct_button: true,
  hidden_fields: [],
  required_fields: [],
  instruction_hidden_fields: [],
  instruction_required_fields: ['full_address', 'date_of_birth', 'id_type', 'id_number'],
};

export const ANSWER_LABELS: Record<string, string> = {
  service_type: 'Service Type',
  purchase_price: 'Purchase Price',
  sale_price: 'Sale Price',
  remortgage_property_value: 'Property Value',
  tenure: 'Tenure',
  is_newbuild: 'New Build',
  is_shared_ownership: 'Shared Ownership',
  has_mortgage: 'Mortgage Required',
  is_first_time_buyer: 'First Time Buyer',
  buyer_count: 'Number of Buyers',
  gifted_deposit: 'Gifted Deposit',
  uses_help_to_buy_isa: 'Help to Buy ISA',
  uses_right_to_buy: 'Right to Buy',
  uses_help_to_buy_equity_loan: 'HTB Equity Loan',
  has_existing_mortgage: 'Existing Mortgage',
  seller_count: 'Number of Sellers',
  is_buy_to_let: 'Buy to Let',
  transfer_of_equity: 'Transfer of Equity',
  remortgagor_count: 'Number of Remortgagors',
  recommend_mortgage_broker: 'Recommend Mortgage Broker',
  buy_to_let: 'Buy to Let',
  second_home: 'Second Home',
  company_purchase: 'Company Purchase',
  auction_purchase: 'Auction Purchase',
  probate_related: 'Probate Related',
  speed_essential: 'Urgency Essential',
  full_address: 'Full Address',
  lender_name: 'Lender Name',
  source_of_funds_notes: 'Source of Funds',
  chain_related_notes: 'Chain Notes',
  instruct_timeline: 'Timeline',
  special_instructions: 'Special Instructions',
  property_postcode: 'Property Postcode',
};
