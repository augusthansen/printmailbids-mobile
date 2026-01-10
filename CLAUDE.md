# PrintMailBids Mobile App

## Project Overview
React Native mobile app for PrintMailBids - a B2B marketplace for buying and selling commercial print and mail equipment through auctions and offers.

## Tech Stack
- **Framework**: React Native with Expo (SDK 52)
- **Language**: TypeScript
- **Navigation**: React Navigation (stack + bottom tabs)
- **State Management**: TanStack Query (React Query) for server state
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Payments**: Stripe React Native SDK
- **Styling**: StyleSheet with custom theme system

## Project Structure
```
src/
├── components/       # Reusable UI components (Avatar, ImageGallery, etc.)
├── constants/        # Theme, config, and app constants
│   ├── theme.ts      # Colors, spacing, typography, shadows
│   └── config.ts     # API URLs, Supabase keys, bid increments
├── contexts/         # React contexts (Auth, Theme)
├── lib/              # Supabase client setup
├── navigation/       # Navigation configuration
│   ├── RootNavigator.tsx   # Auth flow + main app
│   ├── MainNavigator.tsx   # Bottom tab navigator
│   └── types.ts            # Navigation type definitions
├── screens/          # Screen components organized by feature
│   ├── activity/     # Dashboard, bids, offers, invoices
│   ├── admin/        # Admin panel, user management, analytics
│   ├── auth/         # Sign in, sign up, forgot password
│   ├── checkout/     # Payment flow
│   ├── home/         # Browse listings, search
│   ├── listing/      # Listing detail, place bid, make offer
│   ├── messages/     # Conversations, messaging
│   ├── onboarding/   # New user setup flow
│   ├── profile/      # User profile, settings, addresses
│   └── seller/       # Seller dashboard, listings, sales
├── types/            # TypeScript type definitions
│   └── database.ts   # Supabase table types
└── utils/            # Helper functions
    ├── formatters.ts # Currency, date, relative time formatting
    ├── haptics.ts    # iOS haptic feedback utilities
    └── avatarUpload.ts # Image upload handling
```

## Key Patterns

### Theme System
- Light/dark mode support via `ThemeContext`
- Use `useTheme()` hook to get `colors` and `isDark`
- Theme-aware colors: `themeColors.textPrimary`, `themeColors.background`, etc.
- iOS Dynamic Type aligned font sizes in `theme.ts`
- Minimum touch target size: 44pt (exported as `minTouchTarget`)

### Data Fetching
- Use TanStack Query for all API calls
- Query keys follow pattern: `['resource', id]` or `['resource', 'filter']`
- Invalidate queries after mutations: `queryClient.invalidateQueries({ queryKey: ['resource'] })`

### Navigation
- Type-safe navigation with param lists in `navigation/types.ts`
- Modal screens use `presentation: 'modal'` or `presentation: 'transparentModal'`
- Always include close buttons with `hitSlop` and `accessibilityLabel`

### Styling Conventions
- Use `spacing` constants (xs: 4, sm: 8, md: 12, lg: 16, xl: 20)
- Use `borderRadius` constants (sm: 4, md: 8, lg: 12, xl: 16)
- Use `fontSize` constants aligned to iOS Dynamic Type
- Section titles: uppercase, `fontSize.xs`, `marginBottom: spacing.md`
- Cards: `borderRadius.xl`, `shadows.sm`, themed background

### Accessibility (Apple HIG Compliance)
- All interactive elements need `accessibilityLabel` and `accessibilityRole`
- Minimum touch target: 44x44pt
- Add `hitSlop` to small icons: `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}`
- Use `accessibilityRole="header"` for screen/section titles
- Dark mode colors meet WCAG AA contrast ratios

### Haptic Feedback
- Import from `utils/haptics.ts`
- `lightTap()` - selections, tab switches
- `mediumTap()` - button presses
- `successFeedback()` - completed actions
- `errorFeedback()` - failures

## Database Schema (Key Tables)
- `profiles` - User profiles with seller/admin flags
- `listings` - Equipment listings (auction or fixed price)
- `listing_images` - Images for listings
- `bids` - Auction bids with proxy bidding
- `offers` - Buy now offers with counter-offer support
- `invoices` - Purchase invoices with fulfillment tracking
- `conversations` / `messages` - Messaging system
- `notifications` - In-app notifications

## Common Commands
```bash
# Start development server
npx expo start

# Run on iOS simulator
npx expo start --ios

# Type check
npx tsc --noEmit

# Install dependencies
npm install
```

## Environment Configuration
- Supabase URL and anon key in `src/constants/config.ts`
- Stripe publishable key in `src/constants/config.ts`
- Never commit service role keys - mobile uses anon key only

## Bid Increment Logic
Located in `src/constants/config.ts`:
- $0-$250: $1 increments
- $250-$1,000: $10 increments
- $1,000-$10,000: $50 increments
- $10,000-$50,000: $100 increments
- $50,000-$100,000: $250 increments
- $100,000+: $1,000 increments

## Onboarding Flow

### Overview
New users go through a 4-step onboarding flow before accessing the main app:
1. **Welcome** - Introduction screen
2. **Profile** - Full name (required), company name (optional), avatar upload
3. **Phone Verification** - SMS code verification via Twilio
4. **Completion** - Summary with "Start Browsing" button

### Key Files
- `src/screens/onboarding/OnboardingScreen.tsx` - Main onboarding UI
- `src/contexts/AuthContext.tsx` - `needsOnboarding` logic, `completeOnboarding()`, `skipOnboarding()`
- `src/navigation/RootNavigator.tsx` - Shows onboarding when needed

### Onboarding Logic
```typescript
// User needs onboarding if:
const needsOnboarding = !!(
  profile &&
  !profile.onboarding_completed &&
  !profile.onboarding_skipped
);
```

### Phone Verification API
Mobile app calls web API with Bearer token authentication:
```typescript
// Send code
fetch(`${WEB_APP_URL}/api/verification/send-code`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ phone: formattedPhone, userId: user.id }),
});

// Verify code
fetch(`${WEB_APP_URL}/api/verification/verify-code`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ phone: formattedPhone, code: verificationCode, userId: user.id }),
});
```

### Database Fields for Onboarding
`profiles` table columns:
- `onboarding_completed` (boolean)
- `onboarding_skipped` (boolean)
- `phone` (text)
- `phone_verified` (boolean)
- `phone_verified_at` (timestamp)
- `verified_phone` (text)

### Testing Onboarding
To re-trigger onboarding for a user, run in Supabase SQL editor:
```sql
UPDATE profiles
SET onboarding_completed = false, onboarding_skipped = false
WHERE id = 'USER_UUID';
```

## Important Implementation Notes

### Preventing Screen "Cutting In"
When showing conditional screens (like onboarding), ensure loading state includes profile check:
```typescript
if (isLoading || (isAuthenticated && !profile)) {
  return <LoadingScreen />;
}
```

### Avoiding State Reset in Multi-Step Flows
Don't call `refreshProfile()` mid-flow as it can remount components and reset state. Only refresh after the entire flow completes.

### Avatar Placeholder Styling
For visible avatar placeholders in dark mode, use explicit colors (not theme colors that may blend in):
```typescript
avatarPlaceholder: {
  width: 120,
  height: 120,
  borderRadius: 60,
  backgroundColor: '#374151',
  borderColor: '#6b7280',
  borderWidth: 2,
}
```

### Button Container Pattern
Wrap buttons in a container to prevent crowding:
```typescript
<View style={styles.buttonContainer}>
  <TouchableOpacity style={styles.primaryButton}>...</TouchableOpacity>
</View>

// Style
buttonContainer: {
  width: '100%',
  paddingHorizontal: spacing.md,
  marginTop: spacing.lg,
}
```

## Phone Verification in Bid Flow

### Overview
Users must verify their phone number before placing their first bid. The verification modal appears inline on the PlaceBidScreen without navigating away.

### Flow
1. User taps "Place Bid"
2. If `profile.phone_verified` is false → Phone verification modal appears
3. User enters phone number with SMS consent disclosure
4. 6-digit verification code sent via Twilio
5. After verification succeeds → Check for seller terms
6. If listing has `seller_terms` or seller has default `seller_terms` → Terms modal appears
7. User must check agreement checkbox
8. After accepting → Bid is placed

### Key Files
- `src/screens/listing/PlaceBidScreen.tsx` - Contains inline phone verification and terms modals
- `src/screens/profile/PhoneVerificationScreen.tsx` - Standalone verification screen (for profile settings)

### Seller Terms
Terms are fetched from either:
- `listing.seller_terms` (listing-specific terms)
- `sellerProfile.seller_terms` (seller's default terms)

Users only need to accept terms once per listing (checked via `listing.my_bid` existence).

## Twilio SMS Configuration

### Production Setup
- **Twilio Phone**: Toll-free number configured in Vercel
- **Account SID**: Stored in environment variables
- SMS sent via web app API endpoints

### Environment Variables (Vercel Production)
```
TWILIO_ACCOUNT_SID=<your-account-sid>
TWILIO_AUTH_TOKEN=<secret>
TWILIO_PHONE_NUMBER=<your-phone-number>
```

### Dev Mode (Local Testing)
In web app's `.env.local`, uncomment to skip real SMS:
```
DEV_SKIP_SMS=true
DEV_VERIFICATION_CODE=123456
```

### Toll-Free Verification
Toll-free numbers require A2P (Application-to-Person) verification in Twilio console. If messages show error 30034 (blocked), complete verification at: Twilio Console → Messaging → Toll-Free Verification

### API Endpoints
```typescript
// Send verification code
POST ${API_URL}/verification/send-code
Body: { phone: string, userId: string }

// Verify code
POST ${API_URL}/verification/verify-code
Body: { code: string, userId: string }
```

## Proxy Bidding System

### How It Works
- Users enter a "maximum bid" amount
- System automatically bids the minimum needed to stay ahead
- If outbid, system auto-bids up to user's max
- Bid placed via web API: `POST ${API_URL}/bids/place`

### Bid Response Fields
```typescript
{
  success: boolean;
  message: string;
  currentPrice: number;
  bidCount: number;
  wasOutbid?: boolean;      // True if immediately outbid by another proxy
  reserveMet?: boolean;     // Reserve price status
  auctionExtended?: boolean; // Soft-close triggered
  newEndTime?: string;      // New end time if extended
}
```

### Soft-Close
Bids in the last 2 minutes extend the auction by 2 minutes. The PlaceBidScreen shows a warning when in soft-close window.

## Vercel Configuration

### Cron Jobs (Hobby Plan Limits)
Limited to 2 daily cron jobs in `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/emails/daily-digest", "schedule": "0 13 * * *" },
    { "path": "/api/auctions/process-ended", "schedule": "0 15 * * *" }
  ]
}
```

## Testing Helpers

### Reset Phone Verification
```sql
UPDATE profiles
SET phone = null, phone_verified = false, phone_verified_at = null, verified_phone = null
WHERE id = 'USER_UUID';

DELETE FROM phone_verification_codes WHERE user_id = 'USER_UUID';
```

### Reset Listing to Active Auction
```sql
UPDATE listings
SET status = 'active', end_time = NOW() + INTERVAL '24 hours'
WHERE id = 'LISTING_UUID';
```

## Fulfillment Workflow

### Status Flow
```
awaiting_payment → paid → packaging → ready_for_pickup → shipped → completed
```
Note: The `delivered` status is skipped - buyer goes directly from `shipped` to `completed` when confirming delivery.

### Role-Based Actions
- **Seller actions**: Mark Packaging → Mark Ready → Mark Shipped (seller's last action)
- **Buyer action**: "Mark as Delivered" button appears when status is `shipped` - buyer confirms receipt and delivery condition

### Buyer/Seller Determination Per Transaction
```typescript
const isBuyer = user?.id === invoice?.buyer_id;
const isSeller = user?.id === invoice?.seller_id;
```
This is transaction-specific, so a user who is both a buyer AND seller on the platform will see correct actions based on their role in each specific transaction. Admins follow the same rules - no special transaction-level permissions.

### Key Files
- `src/screens/activity/InvoiceDetailScreen.tsx` - Main invoice detail with fulfillment workflow
- `src/screens/activity/MyInvoicesScreen.tsx` - Buyer's purchases list with mini pipeline
- `src/screens/seller/MySalesScreen.tsx` - Seller's sales list

### Active Transaction Logic
A transaction is considered "active" (not complete) unless:
```typescript
fulfillment_status === 'completed' || delivery_confirmed_at !== null
```

## Delivery Confirmation

### Flow
1. Buyer taps "Mark as Delivered" when item arrives
2. Modal appears with condition options (Good/Damaged/Partial)
3. Buyer can upload BOL and delivery photos (up to 5)
4. On submit, status changes to `completed`

### Database Fields
```typescript
delivery_confirmed_at: string | null;
delivery_confirmed_by: string | null;
delivery_condition: 'good' | 'damaged' | 'partial' | null;
delivery_notes: string | null;
delivery_bol_url: string | null;
delivery_damage_photos: string[] | null;
```

## Image Upload to Supabase Storage

### Storage Bucket Setup
The `delivery-documents` bucket must be configured:
```sql
-- Make bucket public
UPDATE storage.buckets SET public = true WHERE id = 'delivery-documents';

-- Public read policy
CREATE POLICY "Public read access for delivery documents"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'delivery-documents');

-- Authenticated upload policy
CREATE POLICY "Authenticated users can upload delivery documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'delivery-documents');
```

### Upload Pattern for React Native
Blob uploads create 0-byte files. Use this pattern instead:
```typescript
// 1. Fetch file and convert to blob
const response = await fetch(uri);
const blob = await response.blob();

// 2. Convert blob to base64
const base64 = await new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => {
    const base64Data = (reader.result as string).split(',')[1];
    resolve(base64Data);
  };
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// 3. Decode base64 to Uint8Array
const binaryString = atob(base64);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}

// 4. Upload Uint8Array
const { data, error } = await supabase.storage
  .from('delivery-documents')
  .upload(fileName, bytes, { contentType });
```

### MIME Type Mapping
Use `image/jpeg` not `image/jpg`:
```typescript
const getMimeType = (ext: string) => {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'heic':
      return 'image/heic';
    // ...
  }
};
```

### expo-image Source Format
For remote URLs, use object format:
```typescript
// Correct
<Image source={{ uri: imageUrl }} />

// Wrong - will show empty
<Image source={imageUrl} />
```

## Keyboard Handling in Modals

Wrap modal content for proper keyboard dismissal:
```typescript
import { Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView } from 'react-native';

<Modal onRequestClose={() => { Keyboard.dismiss(); setShowModal(false); }}>
  <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
    <View style={styles.modalOverlay}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalContent}>
            {/* Modal content */}
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  </TouchableWithoutFeedback>
</Modal>
```

## Multi-Photo Selection

Allow selecting multiple photos at once:
```typescript
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsMultipleSelection: true,
  selectionLimit: remainingSlots, // e.g., 5 - currentPhotos.length
  quality: 0.8,
});

if (!result.canceled && result.assets.length > 0) {
  const newPhotos = result.assets.map(asset => asset.uri);
  setPhotos(prev => [...prev, ...newPhotos].slice(0, 5));
}
```

## Dashboard Layout

### Section Ordering
- Active transaction banners always appear at TOP (for all account types)
- Non-admin accounts: Buyer activity first, then Seller activity
- Admin accounts: Seller activity first

### Active Transaction Banners
Three types shown at top when applicable:
1. **Orders In Progress** (blue) - buyer's active orders
2. **Active Sales** (green) - seller's active transactions
3. **Invoices Ready** (amber) - buyer's unpaid invoices

## Testing Helpers

### Reset Delivery Confirmation
```sql
UPDATE invoices
SET
  fulfillment_status = 'shipped',
  delivered_at = NULL,
  delivery_confirmed_at = NULL,
  delivery_confirmed_by = NULL,
  delivery_condition = NULL,
  delivery_notes = NULL,
  delivery_bol_url = NULL,
  delivery_damage_photos = NULL
WHERE id = 'INVOICE_UUID';
```

### Check Storage Files
```sql
SELECT name, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'delivery-documents'
ORDER BY created_at DESC;
```

## Freight Shipping Modal

### Current Implementation
The shipping modal (`InvoiceDetailScreen.tsx:1915-2189`) is a comprehensive freight form with:
- Freight Carrier (required text input)
- PRO Number, BOL Number
- Freight Class (horizontal scrollable picker: 50, 55, 60, 65, 70, 77.5, 85, 92.5, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500)
- Weight (lbs)
- Pickup Date, Est. Delivery Date
- Pickup Contact (name, company, phone, email)
- Delivery Contact (name, company, phone, email)
- Special Instructions

### Database Fields for Freight
```typescript
// invoices table
shipping_carrier: string;           // Freight carrier name
freight_pro_number: string;         // PRO tracking number
freight_bol_number: string;         // Bill of Lading number
freight_class: string;              // e.g., "70", "100"
freight_weight_lbs: number;
freight_pickup_date: string;
freight_estimated_delivery: string;
freight_pickup_contact: JSON;       // { name, company, phone, email }
freight_delivery_contact: JSON;     // { name, company, phone, email }
freight_special_instructions: string;
```

### Known Issue / TODO
**Buyer typically arranges shipping** - The current modal assumes seller arranges freight, but in reality the buyer usually coordinates shipping. Consider:
- Making the seller freight form optional/simpler
- Adding buyer shipping arrangement workflow
- Reference web app implementation at `src/app/dashboard/invoices/[id]/page.tsx`

## Offer / Counter-Offer System

### Overview
The offer system uses web API endpoints for all operations (not direct Supabase calls) to ensure proper business logic, notifications, and invoice creation.

### Expected Flow
1. **Buyer makes offer** → Seller receives `new_offer` notification
2. **Seller can**: Accept (creates invoice), Decline, or Counter
3. **If counter** → Buyer receives `offer_countered` notification
4. **Buyer can**: Accept, Decline, or Counter back
5. Chain continues until accepted, declined, or withdrawn

### Key Files
- `src/screens/listing/MakeOfferScreen.tsx` - Create offers and counter offers
- `src/screens/activity/MyOffersScreen.tsx` - View sent/received offers with actions

### API Endpoints (Web App)
All offer operations go through the web API with Bearer token auth:
```typescript
// Submit new offer
POST ${API_URL}/offers/submit
Body: { listingId, amount, message? }

// Respond to offer (accept/decline/counter)
POST ${API_URL}/offers/respond
Body: { offerId, action: 'accept' | 'decline' | 'counter', counterAmount?, counterMessage? }

// Withdraw offer
POST ${API_URL}/offers/withdraw
Body: { offerId }
```

### Offer Limits
- **Buyers**: Maximum 3 original offers per listing
- **Sellers**: Maximum 3 counter offers per listing
- Tracked via `userOfferCount` query that traverses offer chain

### Database Schema
```typescript
// offers table
id: string;
listing_id: string;
buyer_id: string;           // Always the original buyer (maintained through chain)
seller_id: string;          // Always the listing seller
amount: number;
message: string | null;
status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'withdrawn';
parent_offer_id: string | null;  // Links counter offers to parent
counter_count: number;      // Depth in the counter chain
expires_at: string;         // 48 hours from creation
responded_at: string | null;
created_at: string;
```

### Determining Offer Maker
The `getOfferMaker()` helper in `MyOffersScreen.tsx` determines who made each offer:
```typescript
function getOfferMaker(offer: OfferWithDetails): 'buyer' | 'seller' {
  if (!offer.parent_offer_id) {
    return 'buyer';  // Original offer always by buyer
  }
  // Counter offers alternate: 1st counter = seller, 2nd = buyer, etc.
  // Uses parent_offer chain depth or counter_count
}
```

### Action Button Logic
Action buttons (Accept/Decline/Counter) only show when:
1. Offer status is `pending`
2. Current user DID NOT make this offer

```typescript
const canTakeAction = isPending && (
  (viewMode === 'received' && offerMaker === 'buyer') ||  // Seller viewing buyer's offer
  (viewMode === 'sent' && offerMaker === 'seller')        // Buyer viewing seller's counter
);
```

### Binding Terms
- **Buyers** must accept binding terms checkbox before submitting offers
- **Sellers** do NOT need to accept terms when countering (buyer already accepted)
- Terms shown in confirmation modal before final submission

### Notification Types
- `new_offer` - New offer from buyer to seller
- `offer_countered` - Counter offer notification
- `offer_accepted` - Offer was accepted
- `offer_declined` - Offer was declined
- `offer_withdrawn` - Offer was withdrawn
- `offer_expired` - Offer expired (48 hours)

### Testing Helpers
```sql
-- Reset all offers for a listing
DELETE FROM offers WHERE listing_id = 'LISTING_UUID';

-- Check offer chain
SELECT id, amount, status, parent_offer_id, counter_count, created_at
FROM offers
WHERE listing_id = 'LISTING_UUID'
ORDER BY created_at;
```

## Active Transactions Dashboard Query

### Bug Fixed
The dashboard wasn't showing correct active transaction count because the query wasn't fetching the required fields.

### Correct Query Pattern
```typescript
const { data: sales } = await supabase
  .from('invoices')
  .select('id, seller_payout_amount, total_amount, status, fulfillment_status, delivery_confirmed_at')
  .eq('seller_id', user.id);

// Filter for active (non-completed) transactions
const activeSales = sales.filter(s =>
  s.fulfillment_status !== 'completed' &&
  !s.delivery_confirmed_at
);
```

## Related Projects
- Web app: `/Users/augusthansen/Documents/Programs/printmailbids`
- Supabase migrations: `/Users/augusthansen/Documents/Programs/printmailbids/supabase/migrations`

**Note**: Reference the web app for API patterns, component styles, database schema, and business logic. The web API endpoints support both cookie-based auth (web) and Bearer token auth (mobile).
