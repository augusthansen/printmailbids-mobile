// PrintMailBids Database Types
// Generated from MOBILE_APP_HANDOFF.md schema

// Enums
export type ListingType = 'auction' | 'make_offer' | 'auction_with_offers';
export type ListingStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'sold' | 'cancelled' | 'expired';
export type EquipmentStatus = 'in_production' | 'installed_idle' | 'needs_deinstall' | 'deinstalled' | 'broken_down' | 'palletized' | 'crated';
export type DeinstallResponsibility = 'buyer' | 'seller_included' | 'seller_additional_fee';
export type OnsiteAssistance = 'full_assistance' | 'forklift_available' | 'limited_assistance' | 'no_assistance';
export type BidStatus = 'active' | 'outbid' | 'winning' | 'won' | 'lost' | 'cancelled';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'withdrawn';
export type InvoiceStatus = 'pending' | 'awaiting_wire' | 'paid' | 'partial' | 'overdue' | 'cancelled' | 'refunded';
export type FulfillmentStatus = 'awaiting_payment' | 'paid' | 'packaging' | 'ready_for_pickup' | 'shipped' | 'delivered' | 'completed' | 'disputed';
export type PaymentMethod = 'credit_card' | 'ach' | 'wire' | 'check' | 'escrow';
export type DeliveryCondition = 'good' | 'damaged' | 'partial';

export type NotificationType =
  | 'outbid' | 'auction_ending_soon' | 'auction_won' | 'auction_ended'
  | 'new_bid' | 'reserve_met' | 'auction_ending'
  | 'new_offer' | 'offer_accepted' | 'offer_declined' | 'offer_countered' | 'offer_expired' | 'offer_withdrawn' | 'offer_response_needed'
  | 'payment_reminder' | 'payment_received' | 'payment_confirmed'
  | 'item_shipped' | 'item_delivered' | 'shipping_quote_received' | 'shipping_quote_requested'
  | 'fees_added' | 'fees_approved' | 'fees_rejected'
  | 'buyer_message' | 'review_received' | 'payout_processed'
  | 'new_listing_saved_search' | 'price_drop';

// Core Tables
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;

  // Verification
  is_verified: boolean;
  verified_at: string | null;
  phone_verified: boolean;

  // Roles
  is_seller: boolean;
  is_admin: boolean;
  seller_approved_at: string | null;

  // Ratings
  seller_rating: number;
  seller_review_count: number;
  buyer_rating: number;
  buyer_review_count: number;

  // Seller Settings
  seller_terms: string | null;
  default_shipping_info: string | null;

  // Payment
  stripe_customer_id: string | null;
  stripe_account_id: string | null;

  // Notifications
  notify_email: boolean;
  notify_push: boolean;
  notify_sms: boolean;

  // Custom Commission
  custom_buyer_premium_percent: number | null;
  custom_seller_commission_percent: number | null;

  // Wire Transfer Instructions (for sellers)
  wire_bank_name: string | null;
  wire_routing_number: string | null;
  wire_account_number: string | null;
  wire_account_name: string | null;
  wire_bank_address: string | null;
  wire_swift_code: string | null;
  wire_additional_instructions: string | null;

  created_at: string;
  updated_at: string;
}

export interface UserAddress {
  id: string;
  user_id: string;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;

  // Equipment handling
  has_loading_dock: boolean;
  has_forklift: boolean;
  forklift_capacity_lbs: number | null;
  has_overhead_crane: boolean;
  crane_capacity_lbs: number | null;
  ground_level_access: boolean;

  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  seller_terms: string | null;
  shipping_info: string | null;
  primary_category_id: string | null;

  // Type & Status
  listing_type: ListingType;
  status: ListingStatus;

  // Pricing
  starting_price: number | null;
  reserve_price: number | null;
  buy_now_price: number | null;
  fixed_price: number | null;
  current_bid: number | null;
  bid_count: number;

  // Make Offer
  accept_offers: boolean;
  auto_accept_price: number | null;
  auto_decline_price: number | null;

  // Timing
  start_time: string | null;
  end_time: string | null;
  original_end_time: string | null;

  // Equipment Details
  make: string | null;
  model: string | null;
  year: number | null;
  serial_number: string | null;
  condition: string | null;
  hours_count: number | null;
  equipment_status: EquipmentStatus | null;

  // Dimensions & Specs
  weight_lbs: number | null;
  length_inches: number | null;
  width_inches: number | null;
  height_inches: number | null;
  floor_length_ft: number | null;
  floor_width_ft: number | null;
  electrical_requirements: string | null;
  air_requirements_psi: number | null;

  // Logistics
  deinstall_responsibility: DeinstallResponsibility;
  deinstall_fee: number | null;
  onsite_assistance: OnsiteAssistance;
  location_id: string | null;
  removal_deadline: string | null;
  pickup_hours: string | null;
  pickup_notes: string | null;

  // Payment Terms
  payment_due_days: number;
  accepts_credit_card: boolean;
  accepts_ach: boolean;
  accepts_wire: boolean;
  accepts_check: boolean;

  // Buyer Restrictions
  us_buyers_unrestricted: boolean;
  us_buyers_verified_only: boolean;
  us_buyers_approval_required: boolean;
  intl_buyers_unrestricted: boolean;
  intl_buyers_verified_only: boolean;
  intl_buyers_approval_required: boolean;

  // Tracking
  inventory_id: string | null;
  view_count: number;
  watch_count: number;

  created_at: string;
  updated_at: string;
  published_at: string | null;
  ended_at: string | null;
}

export interface ListingImage {
  id: string;
  listing_id: string;
  url: string;
  thumbnail_url: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface ListingVideo {
  id: string;
  listing_id: string;
  url: string;
  video_type: string;
  thumbnail_url: string | null;
  title: string | null;
  sort_order: number;
  created_at: string;
}

export interface Bid {
  id: string;
  listing_id: string;
  bidder_id: string;
  amount: number;
  max_bid: number;
  status: BidStatus;
  is_auto_bid: boolean;
  created_at: string;
}

export interface Offer {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  message: string | null;
  status: OfferStatus;
  parent_offer_id: string | null;
  counter_count: number;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  listing_id: string;
  seller_id: string;
  buyer_id: string;

  // Amounts
  sale_amount: number;
  buyer_premium_percent: number;
  buyer_premium_amount: number;
  shipping_amount: number;
  packaging_amount: number;
  tax_amount: number;
  total_amount: number;

  // Seller Fees
  seller_commission_percent: number;
  seller_commission_amount: number;
  seller_payout_amount: number;

  // Status
  status: InvoiceStatus;
  fulfillment_status: FulfillmentStatus;

  // Payment
  payment_due_date: string;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;

  // Shipping
  shipping_carrier: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;

  // Freight
  freight_bol_number: string | null;
  freight_pro_number: string | null;
  freight_class: string | null;
  freight_weight_lbs: number | null;
  freight_pickup_date: string | null;
  freight_estimated_delivery: string | null;
  freight_pickup_contact: Record<string, unknown> | null;
  freight_delivery_contact: Record<string, unknown> | null;
  freight_special_instructions: string | null;

  // Delivery Confirmation
  delivery_confirmed_at: string | null;
  delivery_confirmed_by: string | null;
  delivery_condition: DeliveryCondition | null;
  delivery_notes: string | null;
  delivery_bol_url: string | null;
  delivery_damage_photos: string[] | null;

  // Notes
  seller_notes: string | null;
  buyer_notes: string | null;
  internal_notes: string | null;

  // Wire Transfer
  wire_initiated_at: string | null;
  wire_reference_number: string | null;
  wire_confirmed_at: string | null;
  wire_confirmed_by: string | null;

  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;

  // Related entities
  listing_id: string | null;
  invoice_id: string | null;
  offer_id: string | null;
  bid_id: string | null;

  // Status
  is_read: boolean;
  read_at: string | null;

  // Delivery tracking
  sent_push: boolean;
  sent_email: boolean;
  sent_sms: boolean;

  created_at: string;
}

export interface Conversation {
  id: string;
  listing_id: string | null;
  invoice_id: string | null;
  participant_1_id: string;
  participant_2_id: string;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface WatchlistItem {
  user_id: string;
  listing_id: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
}

// Extended types with relations
export interface ListingWithImages extends Listing {
  images: ListingImage[];
  videos?: ListingVideo[];
  seller?: Profile;
  location?: UserAddress;
  category?: Category;
}

export interface ListingWithDetails extends ListingWithImages {
  my_bid?: Bid | null;
  is_watched?: boolean;
}

export interface ConversationWithDetails extends Conversation {
  listing?: Listing;
  invoice?: Invoice;
  other_participant?: Profile;
  last_message?: Message;
  unread_count?: number;
}

export interface InvoiceWithDetails extends Invoice {
  listing?: ListingWithImages;
  seller?: Profile;
  buyer?: Profile;
}
