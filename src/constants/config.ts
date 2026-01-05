// PrintMailBids Mobile App Configuration
// Only public keys - never expose service role keys in mobile app

export const SUPABASE_URL = 'https://uozfvhwfkhzsmbsixcyb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvemZ2aHdma2h6c21ic2l4Y3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0MTM2NTUsImV4cCI6MjA4MDk4OTY1NX0.WiKZRP1QuUxfwDh0pNveSwuz86C1VVJFXQ8Oh_05A7A';

export const STRIPE_PUBLISHABLE_KEY = 'pk_test_51Sf9SUK7o7rrtdZHAhLWufEBvNZ3oa8NpTp61x51AeHMsFlApv41SLSgcGdpAH3lR24hrlliKKwTIg6l1Xc6UyZz00i6juX1Se';

export const APP_URL = 'https://printmailbids.com';
export const API_URL = 'https://printmailbids.com/api';

// Deep linking scheme
export const APP_SCHEME = 'printmailbids';

// Platform fees
export const BUYER_PREMIUM_PERCENT = 8;
export const SELLER_COMMISSION_PERCENT = 8;

// Auction settings
export const SOFT_CLOSE_MINUTES = 2;
export const OFFER_EXPIRY_HOURS = 48;
export const MAX_OFFERS_PER_LISTING = 3;

// Bid increments
export const BID_INCREMENTS = [
  { maxBid: 250, increment: 1 },
  { maxBid: 1000, increment: 10 },
  { maxBid: 10000, increment: 50 },
  { maxBid: Infinity, increment: 100 },
] as const;

export function getBidIncrement(currentBid: number): number {
  for (const { maxBid, increment } of BID_INCREMENTS) {
    if (currentBid < maxBid) {
      return increment;
    }
  }
  return 100;
}

export function getMinNextBid(currentBid: number): number {
  return currentBid + getBidIncrement(currentBid);
}
