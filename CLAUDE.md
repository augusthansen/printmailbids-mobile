# PrintMailBids Mobile App

## Project Overview
React Native mobile app for PrintMailBids - a B2B marketplace for buying and selling commercial print and mail equipment through auctions and offers.

## Tech Stack
- **Framework**: React Native with Expo (SDK 54)
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
New users go through a multi-step onboarding flow before accessing the main app:

**Buyer Flow (5 steps):**
1. **Welcome** - Introduction screen
2. **Profile** - Full name (required), company name (optional), avatar upload
3. **Account Type** - Choose buyer, seller, or both
4. **Phone Verification** - SMS code verification via Twilio (with animated success checkmark)
5. **Push Notifications** - Request permission with benefit cards
6. **Completion** - Summary with "Start Browsing" button

**Seller Flow (8 steps):** Same as buyer, plus:
6. **Seller Terms** - Default terms & conditions for listings
7. **Seller Shipping** - Default shipping/pickup information
8. **Seller Wire Transfer** - Bank details for wire payments
9. **Completion** - Summary with "Start Browsing" button

### Seller Step "Add Later" Info Cards
Each seller step shows an info card reminding users they can add this info later:
```typescript
<View style={[styles.laterInfoCard, { backgroundColor: themeColors.accentFaint }]}>
  <Feather name="info" size={16} color={themeColors.accent} />
  <Text style={[styles.laterInfoText, { color: themeColors.accent }]}>
    You can update these anytime in Seller Settings
  </Text>
</View>
```

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
- `is_seller` (boolean) - Set during account type selection
- `notify_push` (boolean) - User's push notification preference

### Phone Verification Success Animation
When phone verification succeeds, an animated checkmark is displayed:
```typescript
// Animation refs
const checkmarkScale = useRef(new Animated.Value(0)).current;
const checkmarkOpacity = useRef(new Animated.Value(0)).current;

// Trigger animation on success
useEffect(() => {
  if (showPhoneSuccess) {
    Animated.parallel([
      Animated.spring(checkmarkScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(checkmarkOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }
}, [showPhoneSuccess]);
```

### Push Notifications Step
The notifications step shows 4 benefit cards explaining why to enable push:
1. **Outbid Alerts** - Know instantly when someone outbids you
2. **New Offers** - Get notified of offers on your listings
3. **Auction Ending** - Reminders before auctions you're watching end
4. **Messages** - Never miss a message from buyers or sellers

If permission was previously denied, tapping "Enable Notifications" opens Settings.

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

## Seller Auto-Detection

### The `is_seller` Flag
The dashboard's "Selling Activity" section only appears when `profile.is_seller` is `true`. This flag is set:
1. During onboarding when user selects "Seller" or "Both" account type
2. Automatically when creating a first listing (CreateListingScreen.tsx)

### Auto-Set `is_seller` on Listing Creation
When a user creates their first listing, we automatically update their profile:
```typescript
// src/screens/seller/CreateListingScreen.tsx
// After successful listing creation:
if (!profile?.is_seller) {
  await supabase
    .from('profiles')
    .update({ is_seller: true, updated_at: new Date().toISOString() })
    .eq('id', user!.id);
  refreshProfile?.();
}
```

### Fixing Missing Seller Status
If a user has listings but can't see seller stats on dashboard:
```sql
-- Set user as seller
UPDATE profiles
SET is_seller = true, updated_at = NOW()
WHERE email = 'user@example.com';
```

### Dashboard Visibility Requirements
| Section | Requirement |
|---------|-------------|
| Buying Activity | Always visible (all users can browse/buy) |
| Selling Activity | Only when `profile.is_seller = true` OR `profile.is_admin = true` |
| Pending Offers (seller) | Only in Selling Activity section |
| Active Listings | Only in Selling Activity section |

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

### Reset Push Token for User
```sql
-- Clear push token from a specific user
UPDATE profiles
SET expo_push_token = null
WHERE email = 'user@example.com';

-- Check which accounts have push tokens
SELECT id, email, expo_push_token, notify_push
FROM profiles
WHERE expo_push_token IS NOT NULL
ORDER BY updated_at DESC;
```

### Set User as Seller
```sql
-- Enable seller dashboard for a user
UPDATE profiles
SET is_seller = true, updated_at = NOW()
WHERE email = 'user@example.com';
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

## App Store Submission Checklist

### Before Submission
1. **Replace EAS Project ID**: Update `YOUR_EAS_PROJECT_ID` in `app.json` after running `eas build:configure`
2. **Configure Stripe Production Keys**: Replace test publishable key in `src/constants/config.ts`
3. **App Icons**: Ensure all icon sizes are provided in `assets/` folder
4. **Privacy Policy URL**: Required for App Store - add to app description
5. **Screenshots**: Prepare 6.5" and 5.5" iPhone screenshots

### EAS Build Commands
```bash
# Configure EAS for first time
npx eas build:configure

# Development build for testing
npx eas build --platform ios --profile development

# Production build for App Store
npx eas build --platform ios --profile production

# Submit to App Store
npx eas submit --platform ios
```

### Apple App Store Requirements Met
- ✅ Privacy Manifest (`NSPrivacyAccessedAPITypes`)
- ✅ Encryption declaration (`ITSAppUsesNonExemptEncryption: false`)
- ✅ Required permissions with usage descriptions
- ✅ Dark mode support (`userInterfaceStyle: automatic`)
- ✅ iPad support (`supportsTablet: true`)
- ✅ Minimum touch target 44pt (Apple HIG)
- ✅ Accessibility labels on interactive elements

## Push Notifications

### Overview
Push notifications are implemented using Expo's push notification service. The mobile app registers for push tokens on startup and saves them to the user's profile. The web API sends notifications via Expo's push API.

### Key Files
- `src/utils/pushNotifications.ts` - Token registration, permission requests
- `src/contexts/NotificationContext.tsx` - App-wide notification state
- `App.tsx` - Registers push token on startup, handles notification responses
- `src/screens/profile/NotificationSettingsScreen.tsx` - User can toggle push on/off, test buttons

### EAS Project Configuration
```json
// app.json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "b4ede531-5a40-4e91-b4ad-da3142170e95"
      }
    }
  }
}
```

### Database Fields
```typescript
// profiles table
expo_push_token: string | null;  // Expo push token (ExponentPushToken[...])
notify_push: boolean;            // User's push notification preference
```

### Push Token Registration Flow
```typescript
// In App.tsx on startup
import { registerForPushNotificationsAsync, savePushTokenToProfile } from './src/utils/pushNotifications';

// After user authenticates
const token = await registerForPushNotificationsAsync();
if (token && session?.user?.id) {
  await savePushTokenToProfile(supabase, session.user.id, token);
}
```

### Notification Events Covered
All major events send push notifications via the unified notification service:

| Event | Recipient | Web API Endpoint |
|-------|-----------|------------------|
| Outbid | Previous high bidder | `POST /api/bids/place` |
| New bid on listing | Seller | `POST /api/bids/place` |
| Reserve price met | Seller | `POST /api/bids/place` |
| Auction won | Winning buyer | `POST /api/auctions/process-ended` |
| Auction ended | Seller | `POST /api/auctions/process-ended` |
| Reserve not met | All bidders | `POST /api/auctions/process-ended` |
| New offer | Seller | `POST /api/offers/submit` |
| Offer accepted | Buyer | `POST /api/offers/respond` |
| Offer declined | Buyer | `POST /api/offers/respond` |
| Offer countered | Recipient | `POST /api/offers/respond` |
| Payment received | Seller | Stripe webhook |
| Payment confirmed | Buyer | Stripe webhook |
| Item shipped | Buyer | `POST /api/invoices/ship` |
| New message | Recipient | `POST /api/messages/send` |
| Wire payment requested | Seller | `POST /api/wire/request-instructions` |
| Wire instructions available | Buyer | `POST /api/wire/notify-available` |

### Web App Notification Service
Located at `src/lib/notifications/index.ts` in the web app:
```typescript
import notifications from '@/lib/notifications';

// Send outbid notification with push
await notifications.outbid(userId, listingId, listingTitle, newHighBid);

// Send auction won notification
await notifications.auctionWon(buyerId, listingId, listingTitle, winningBid, invoiceId);

// Generic notification
import { sendNotification } from '@/lib/notifications';
await sendNotification({
  userId,
  type: 'payment_confirmed',
  title: 'Payment Confirmed',
  body: 'Your payment has been processed.',
  listingId,
  invoiceId,
});
```

### Important: Awaiting Notifications in Vercel
Serverless functions (Vercel) may terminate before async operations complete. Always **await** notification calls to ensure push is sent:
```typescript
// CORRECT - await the notification
try {
  const result = await notifications.outbid(userId, listingId, title, amount);
  console.log('Notification result:', { success: result.success, pushSent: result.pushSent });
} catch (err) {
  console.error('Failed to send notification:', err);
}

// WRONG - function may terminate before push is sent
notifications.outbid(userId, listingId, title, amount).catch(console.error);
```

### Testing Push Notifications
The NotificationSettingsScreen has two test buttons:
1. **Send Local Test** - Triggers a local notification (no server)
2. **Send Server Push** - Calls `POST /api/test/push-notification` to test full flow

### Debugging Push Issues
Check Vercel logs for these entries:
```
[Notification] Sending notification: { type, userId, title }
[Notification] User preferences: { notify_push, hasToken, tokenPrefix }
[Notification] Push check: { skipPush, notify_push, hasToken, isValidToken }
[Notification] Push result: { pushSent, error }
```

If `pushSent: false`, check:
1. User has `notify_push: true` in profile
2. User has valid `expo_push_token` saved
3. Token format is valid (`ExponentPushToken[...]`)

### Token Validation
```typescript
import { isExpoPushToken } from '@/lib/push';

// Returns true for valid tokens
isExpoPushToken('ExponentPushToken[xxxxxx]'); // true
isExpoPushToken('invalid'); // false
```

### Push Token Uniqueness (Device-User Binding)
**CRITICAL**: Each push token must only be registered to ONE user account. When a user logs in on a device, the token is:
1. Cleared from all other accounts that had it
2. Saved to the current user's profile

This prevents duplicate notifications when testing with multiple accounts on one device.

```typescript
// src/utils/pushNotifications.ts
export async function savePushToken(userId: string, token: string): Promise<boolean> {
  try {
    // First, clear this token from any other accounts
    const { error: clearError } = await supabase
      .from('profiles')
      .update({ expo_push_token: null })
      .eq('expo_push_token', token)
      .neq('id', userId);

    if (clearError) {
      console.log('Note: Could not clear token from other accounts:', clearError.message);
    }

    // Now save the token to the current user's profile
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);

    if (error) {
      console.error('Error saving push token:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error saving push token:', error);
    return false;
  }
}
```

### Debugging Duplicate Notifications
If a device receives notifications for the wrong account:
```sql
-- Find all accounts with push tokens
SELECT id, email, expo_push_token
FROM profiles
WHERE expo_push_token IS NOT NULL;

-- Clear token from all accounts except the intended one
UPDATE profiles
SET expo_push_token = null
WHERE expo_push_token IS NOT NULL
  AND email != 'correct-user@example.com';
```

## Future Feature Recommendations

### High Priority
1. **Biometric Authentication**: Add Face ID/Touch ID for quick sign-in (plugin already configured)
2. **Offline Support**: Cache listings and allow offline browsing with TanStack Query persistence
3. **Search Screen**: Implement advanced search with filters (category, location, price range)

### Medium Priority
1. **Seller Profile Screen**: View seller ratings, past sales, and contact info
2. **Image Zoom**: Add pinch-to-zoom in listing image gallery
3. **Share Listings**: Deep link sharing to specific listings
4. **Rate/Review System**: Allow buyers to rate sellers after completed transactions

### Low Priority
1. **Saved Searches**: Save search criteria for quick access
2. **Price Alerts**: Notify when items in price range are listed
3. **Bulk Actions**: Select multiple listings for batch operations (sellers)
4. **Export Data**: Export purchase/sale history to CSV

## Known Limitations

### Current Placeholder Screens
- **Advanced Search** (`HomeStack.Search`): Basic search available on Browse tab, advanced filters coming soon
- **Seller Profile** (`HomeStack.SellerProfile`): Seller info shown in listing detail, dedicated profile page planned

### Platform-Specific Notes
- **Alert.prompt**: Only available on iOS - use Modal with TextInput for cross-platform
- **Haptics**: Only work on physical devices, not simulators
- **expo-image**: Requires `{ uri: url }` object format, not raw URL strings

## Console Logging Strategy

Current console statements are intentional for debugging during development. Before production:

```bash
# Find all console statements
grep -rn "console\." src/ --include="*.tsx" --include="*.ts"
```

Consider implementing a logging service (e.g., Sentry, LogRocket) for production error tracking. Remove verbose debug logs but keep error logs for diagnostics.

## Animated Splash Screen

### Overview
The app uses a custom animated splash screen that provides a polished app launch experience with a fade-in + scale animation.

### How It Works
1. **Native splash** (`expo-splash-screen`) shows immediately on app launch
2. Once React mounts, native splash hides and animated splash takes over
3. Logo fades in (0→1 opacity) while scaling up (0.3→1.0) with spring physics
4. Brief hold (400ms)
5. Entire screen fades out (400ms)
6. App content revealed underneath

### Key Files
- `src/components/AnimatedSplashScreen.tsx` - Animated splash component
- `App.tsx` - Orchestrates splash screen lifecycle

### Implementation Pattern
```typescript
import * as SplashScreen from 'expo-splash-screen';
import AnimatedSplashScreen from './src/components/AnimatedSplashScreen';

// Prevent native splash from auto-hiding
SplashScreen.preventAutoHideAsync();

function AppContent() {
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    const hideSplash = async () => {
      await SplashScreen.hideAsync();
      setAppIsReady(true);
    };
    hideSplash();
  }, []);

  return (
    <>
      {/* App content */}
      {appIsReady && showAnimatedSplash && (
        <AnimatedSplashScreen onAnimationComplete={() => setShowAnimatedSplash(false)} />
      )}
    </>
  );
}
```

### Development vs Production
- **Expo Go**: Shows Expo's default splash briefly before animated splash (expected behavior)
- **Development/Production builds**: Shows your configured splash-icon.png seamlessly

### Configuration
In `app.json`:
```json
{
  "splash": {
    "image": "./assets/splash-icon.png",
    "resizeMode": "contain",
    "backgroundColor": "#ffffff",
    "dark": {
      "image": "./assets/splash-icon.png",
      "backgroundColor": "#0f172a"
    }
  },
  "plugins": ["expo-splash-screen", ...]
}
```

## Performance Optimizations Applied

1. **TanStack Query**: Server state caching with 30-second refetch intervals
2. **expo-image**: Optimized image loading with transitions and caching
3. **useMemo/useCallback**: Applied to expensive computations and callbacks
4. **FlatList**: Used for long lists with proper `keyExtractor`
5. **Hermes Engine**: Enabled for improved JS performance
6. **Animated Splash**: Uses native driver for 60fps animations during app launch

## Wire Payment Request Flow

### Overview
When a seller hasn't set up wire transfer instructions, buyers can request them. This triggers a notification flow that guides sellers to add their bank details, then notifies buyers when wire payment becomes available.

### Complete Flow
1. **Buyer** opens Checkout screen for an invoice
2. Wire Transfer option shows as unavailable (seller has no wire details)
3. Buyer taps "Request Wire Instructions"
4. **Seller** receives in-app + push notification: "Wire Payment Requested"
5. Seller taps notification → navigates to Wire Instructions screen
6. Seller enters bank details and saves
7. **Buyer** receives in-app + push notification: "Wire Instructions Available"
8. Buyer taps notification → navigates to Checkout screen
9. Wire Transfer is now selectable

### Key Files
- `src/screens/checkout/CheckoutScreen.tsx` - Wire request button and payment selection
- `src/screens/profile/WireInstructionsScreen.tsx` - Seller enters bank details
- `src/screens/activity/DashboardScreen.tsx` - Notification press handlers

### API Endpoints (Web App)
```typescript
// Buyer requests wire instructions from seller
POST ${API_URL}/wire/request-instructions
Body: { invoiceId }
Response: { success, message, pushSent }

// Seller notifies buyers wire is available (called automatically on save)
POST ${API_URL}/wire/notify-available
Body: {} // Uses authenticated user as seller
Response: { success, notified, pushSent }
```

### Database Fields
```typescript
// invoices table
wire_requested_at: string | null;  // Timestamp when buyer requested wire

// profiles table (seller wire details)
wire_bank_name: string | null;
wire_routing_number: string | null;
wire_account_number: string | null;
wire_account_name: string | null;
wire_bank_address: string | null;
wire_swift_code: string | null;
wire_additional_instructions: string | null;
```

### Notification Handling
Wire notifications use `payment_reminder` type but have specific titles for routing:
```typescript
// In DashboardScreen.tsx handleNotificationPress:
if (notification.title === 'Wire Payment Requested') {
  navigation.navigate('ProfileTab', { screen: 'WireInstructions' });
  return;
}

if (notification.title === 'Wire Instructions Available' && notification.invoice_id) {
  navigation.navigate('Checkout', { invoiceId: notification.invoice_id });
  return;
}
```

### Testing Wire Flow
Test buttons are available in **Profile > Notification Settings > Test Wire Payment Flow**:
- **Orange button**: "Test Wire Request (Seller)" - Simulates buyer requesting wire
- **Green button**: "Test Wire Available (Buyer)" - Simulates seller adding wire details

### SQL Helpers
```sql
-- Check wire request status for an invoice
SELECT id, wire_requested_at, status
FROM invoices
WHERE id = 'INVOICE_UUID';

-- Clear wire request for testing
UPDATE invoices
SET wire_requested_at = null
WHERE id = 'INVOICE_UUID';

-- Check seller wire details
SELECT wire_bank_name, wire_routing_number, wire_account_number
FROM profiles
WHERE id = 'SELLER_UUID';

-- Clear seller wire details for testing
UPDATE profiles
SET wire_bank_name = null, wire_routing_number = null, wire_account_number = null,
    wire_account_name = null, wire_bank_address = null, wire_swift_code = null
WHERE id = 'SELLER_UUID';
```

## Dashboard Notifications Modal

### Mark All Read
The notification bell modal includes a "Mark All Read" button that appears when there are unread notifications:
```typescript
// DashboardScreen.tsx
const markAllReadMutation = useMutation({
  mutationFn: async () => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  },
});
```

## Offer Filtering Logic

### Dashboard "Open Offers" Count
The Dashboard shows an "Open Offers" count that only includes offers where:
1. Offer status is `pending`
2. **Listing status is NOT `sold`**

This ensures completed transactions don't appear in the open offers count.

```typescript
// DashboardScreen.tsx - Buyer stats query
const pendingOffers = (pendingOffersResult.data || []).filter(offer => {
  const listingStatus = getOfferListingStatus(offer.listing);
  return listingStatus !== 'sold';
});
```

### MyOffersScreen Filtering
The offers list (`MyOffersScreen.tsx`) filters offers to show only actionable items:
- Hide ALL offers when listing status is `sold`
- Only show active statuses: `pending`, `countered`, `accepted`
- Hide terminal states: `declined`, `expired`, `withdrawn`

```typescript
const filteredOffers = offers?.filter(offer => {
  // If listing is sold, hide ALL offers for that listing
  if (offer.listing?.status === 'sold') {
    return false;
  }

  // Only show active/actionable offers
  const activeStatuses = ['pending', 'countered', 'accepted'];
  if (filter === 'all') {
    return activeStatuses.includes(offer.status);
  }
  return offer.status === filter;
});
```

### Offer Lifecycle
1. **Buyer makes offer** → status: `pending`
2. **Seller can**: Accept (creates invoice, listing → `sold`), Decline, or Counter
3. **If countered** → new offer with `parent_offer_id`, original becomes `countered`
4. **If accepted** → offer `accepted`, invoice created, listing `sold`
5. Once listing is `sold`, all offers for that listing are hidden from "Open Offers"

## GitHub Repository
- Repository: https://github.com/augusthansen/printmailbids-mobile
