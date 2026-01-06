# Offer System Test Plan

## Overview
This document outlines the test cases for the PrintMailBids mobile app offer/counter-offer system.

---

## Test Cases

### 1. Making a New Offer (Buyer Flow)

#### TC-1.1: Basic Offer Submission
- [ ] Navigate to a listing detail page
- [ ] Tap "Make Offer" button
- [ ] Enter a valid offer amount
- [ ] Tap "Send Offer" button
- [ ] Verify confirmation modal appears with terms checkbox
- [ ] Tap terms checkbox to accept
- [ ] Tap "Send Offer" in modal
- [ ] Verify success message appears
- [ ] Verify offer appears in "My Offers" → "Offers Sent" tab

#### TC-1.2: Offer Below Auto-Decline Price
- [ ] Make offer below the listing's auto_decline_price (if set)
- [ ] Verify error message is shown
- [ ] Verify offer is NOT created

#### TC-1.3: Terms Checkbox Required
- [ ] Enter valid offer amount
- [ ] Tap "Send Offer"
- [ ] In modal, tap "Send Offer" WITHOUT checking terms
- [ ] Verify "Terms Required" alert appears
- [ ] Verify offer is NOT submitted

#### TC-1.4: Invalid Offer Amount
- [ ] Leave offer amount empty or enter 0
- [ ] Verify "Send Offer" button is disabled
- [ ] Enter negative number
- [ ] Verify validation error appears

---

### 2. Receiving Offers (Seller Flow)

#### TC-2.1: View Received Offers
- [ ] As seller, navigate to "My Offers" → "Offers Received" tab
- [ ] Verify all offers on your listings appear
- [ ] Verify offer shows buyer name, amount, listing title, status

#### TC-2.2: Accept an Offer
- [ ] Find a pending offer
- [ ] Tap "Accept" button
- [ ] Confirm in the alert dialog
- [ ] Verify offer status changes to "Accepted"
- [ ] Verify buyer receives notification (check other account)

#### TC-2.3: Decline an Offer
- [ ] Find a pending offer
- [ ] Tap "Decline" button
- [ ] Confirm in the alert dialog
- [ ] Verify offer status changes to "Declined"

#### TC-2.4: Counter an Offer
- [ ] Find a pending offer
- [ ] Tap "Counter" button
- [ ] Verify MakeOfferScreen opens with parent offer info displayed
- [ ] Enter new counter amount
- [ ] Submit counter offer (with terms acceptance)
- [ ] Verify original offer status changes to "Countered"
- [ ] Verify counter offer appears with "Counter" badge
- [ ] Verify buyer receives notification

---

### 3. Counter-Offer Chain

#### TC-3.1: Buyer Responds to Seller's Counter
- [ ] As buyer, view seller's counter offer in "Offers Sent" tab
- [ ] Verify Accept/Decline/Counter buttons appear
- [ ] Tap "Counter" to send another counter
- [ ] Verify it goes through successfully
- [ ] Verify seller's counter is marked "Countered"

#### TC-3.2: Multi-Round Negotiation
- [ ] Complete 3+ rounds of counter-offers
- [ ] Verify each party can see the full offer history
- [ ] Verify correct party gets action buttons at each step

#### TC-3.3: Accept Counter Offer
- [ ] Accept a counter offer
- [ ] Verify the entire chain resolves to "Accepted"
- [ ] Verify proper party flow to checkout/invoice

---

### 4. Withdraw Functionality

#### TC-4.1: Withdraw Original Offer
- [ ] As buyer, find your pending offer in "Offers Sent"
- [ ] Tap "Withdraw Offer"
- [ ] Confirm withdrawal
- [ ] Verify offer status changes to "Withdrawn"
- [ ] Verify seller sees offer as "Withdrawn"

#### TC-4.2: Withdraw Counter Offer
- [ ] As seller, withdraw a counter offer you made
- [ ] Verify your counter is marked "Withdrawn"
- [ ] Verify the parent offer is restored to "Pending"
- [ ] Verify buyer can now respond to original offer again

#### TC-4.3: Withdrawn Status Visibility
- [ ] Verify "Withdrawn" filter appears in filter bar
- [ ] Filter by "Withdrawn" status
- [ ] Verify only withdrawn offers are shown

---

### 5. Offer Limit (4 per party)

#### TC-5.1: Buyer Hits 4 Offer Limit
- [ ] As buyer, make 4 offers/counters on same listing
- [ ] Try to make 5th offer
- [ ] Verify "Offer Limit Reached" screen appears
- [ ] Verify "Go Back" button works

#### TC-5.2: Seller Hits 4 Counter Limit
- [ ] As seller, make 4 counter offers on same listing
- [ ] Try to make 5th counter
- [ ] Verify "Offer Limit Reached" screen appears

#### TC-5.3: Limit Per Listing (Not Global)
- [ ] Hit limit on Listing A
- [ ] Verify you can still make offers on Listing B

---

### 6. Notifications

#### TC-6.1: New Offer Notification
- [ ] Buyer makes offer
- [ ] Verify seller receives "new_offer" notification
- [ ] Verify notification contains offer amount and listing title

#### TC-6.2: Counter Offer Notification
- [ ] Seller counters offer
- [ ] Verify buyer receives "offer_countered" notification

#### TC-6.3: Notification Tap Navigation
- [ ] Tap on offer notification
- [ ] Verify it navigates to correct screen (listing or offers)

---

### 7. Edge Cases

#### TC-7.1: Offer on Own Listing
- [ ] Try to make offer on your own listing
- [ ] Verify this is blocked (offer button should not appear)

#### TC-7.2: Offer on Sold/Inactive Listing
- [ ] Try to access MakeOffer for a sold listing
- [ ] Verify appropriate error or redirect

#### TC-7.3: Concurrent Modifications
- [ ] Two users try to accept same offer simultaneously
- [ ] Verify only one succeeds, other gets error

#### TC-7.4: Expired Offer
- [ ] Find/create an offer past its expires_at time
- [ ] Verify status shows as "Expired" or offer cannot be acted upon

---

### 8. UI/UX Checks

#### TC-8.1: Dark Mode
- [ ] Enable dark mode
- [ ] Verify all offer screens render correctly
- [ ] Check terms checkbox visibility
- [ ] Check modal styling

#### TC-8.2: Loading States
- [ ] Verify loading spinner shows when submitting offer
- [ ] Verify buttons are disabled during submission

#### TC-8.3: Error Handling
- [ ] Turn off network while submitting offer
- [ ] Verify error message appears
- [ ] Verify app doesn't crash

#### TC-8.4: Pull to Refresh
- [ ] On MyOffersScreen, pull down to refresh
- [ ] Verify offers reload

---

## App Store Compliance Issues to Check

### Apple App Store Guidelines

#### 1. In-App Purchase (IAP) Requirements
- **CRITICAL**: If offers lead to purchases, Apple requires IAP for digital goods
- For physical goods (industrial equipment): External payments ARE allowed
- Verify: Stripe integration is for physical goods only

#### 2. User Privacy
- [ ] Privacy policy link is accessible
- [ ] Data collection is disclosed
- [ ] No sensitive data in console.logs in production

#### 3. Content Moderation
- [ ] Offer messages should have content filtering (profanity, etc.)
- [ ] Report functionality for inappropriate content

#### 4. Crash Prevention
- [ ] No forced unwrap of optionals
- [ ] Error boundaries for component crashes
- [ ] Graceful handling of null/undefined data

#### 5. Accessibility
- [ ] VoiceOver compatibility
- [ ] Sufficient color contrast
- [ ] Touch targets at least 44x44 points

#### 6. Terms & Conditions
- [ ] Binding offer terms are clear
- [ ] User explicitly agrees before submission (checkbox)
- [ ] Terms are not hidden or misleading

---

## Issues Found During Review

### Critical Issues
1. **Console.log statements in production** - Remove debug logs before App Store submission
2. **Missing invoice creation on accept** - When offer is accepted, invoice should be created automatically

### Medium Issues
1. **No loading state for offer count query** - Could show stale limit data briefly
2. **Missing error alert on accept/decline failure** - Only withdraw has onError handler
3. **Notification not created on withdraw** - Other party should know offer was withdrawn

### Minor Issues
1. **Hardcoded strings** - Should use i18n for localization
2. **No haptic on checkbox tap** - Add light tap feedback
3. **Counter badge could show count** - "Counter (3)" instead of just "Counter"

---

## Database/RLS Checks

### Required RLS Policies
1. **offers INSERT**: `auth.uid() = buyer_id OR auth.uid() = seller_id` ✓
2. **offers UPDATE**: Seller/buyer can update their related offers
3. **offers SELECT**: User can see offers where they are buyer or seller
4. **notifications INSERT**: Allow creating notifications for other users ✓

### Status Constraint
- [ ] Verify `offers_status_check` constraint includes: pending, accepted, declined, countered, expired, withdrawn

---

## Performance Checks

1. [ ] Offer list loads quickly (< 2 seconds)
2. [ ] Submitting offer completes in < 3 seconds
3. [ ] No memory leaks from subscription/query cleanup
4. [ ] Images lazy load properly

---

## Required SQL for RLS Policies

Run these in Supabase SQL Editor to verify/create the necessary policies:

```sql
-- =====================================================
-- OFFERS TABLE POLICIES
-- =====================================================

-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'offers';

-- DROP and recreate if needed
DROP POLICY IF EXISTS "Users can view their offers" ON offers;
DROP POLICY IF EXISTS "Users can create offers" ON offers;
DROP POLICY IF EXISTS "Users can update their offers" ON offers;

-- SELECT: Users can see offers where they are buyer or seller
CREATE POLICY "Users can view their offers" ON offers
FOR SELECT USING (
  auth.uid() = buyer_id OR auth.uid() = seller_id
);

-- INSERT: Users can create offers (buyer for new offers, seller for counters)
CREATE POLICY "Users can create offers" ON offers
FOR INSERT WITH CHECK (
  auth.uid() = buyer_id OR auth.uid() = seller_id
);

-- UPDATE: Users can update offers where they are buyer or seller
CREATE POLICY "Users can update their offers" ON offers
FOR UPDATE USING (
  auth.uid() = buyer_id OR auth.uid() = seller_id
);

-- =====================================================
-- NOTIFICATIONS TABLE POLICIES
-- =====================================================

-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'notifications';

-- Users can create notifications for others (needed for offer notifications)
DROP POLICY IF EXISTS "Users can create notifications" ON notifications;
CREATE POLICY "Users can create notifications" ON notifications
FOR INSERT WITH CHECK (true);  -- Any authenticated user can create

-- Users can only view their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- INVOICES TABLE POLICIES (for offer acceptance)
-- =====================================================

-- Check existing policies
SELECT * FROM pg_policies WHERE tablename = 'invoices';

-- Sellers can create invoices when accepting offers
DROP POLICY IF EXISTS "Sellers can create invoices" ON invoices;
CREATE POLICY "Sellers can create invoices" ON invoices
FOR INSERT WITH CHECK (auth.uid() = seller_id);

-- Users can view invoices where they are buyer or seller
DROP POLICY IF EXISTS "Users can view their invoices" ON invoices;
CREATE POLICY "Users can view their invoices" ON invoices
FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Users can update invoices where they are buyer or seller
DROP POLICY IF EXISTS "Users can update their invoices" ON invoices;
CREATE POLICY "Users can update their invoices" ON invoices
FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- =====================================================
-- LISTINGS TABLE POLICIES (for marking sold)
-- =====================================================

-- Sellers can update their own listings (to mark as sold)
DROP POLICY IF EXISTS "Sellers can update own listings" ON listings;
CREATE POLICY "Sellers can update own listings" ON listings
FOR UPDATE USING (auth.uid() = seller_id);

-- =====================================================
-- VERIFY OFFER STATUS CONSTRAINT
-- =====================================================

-- Check if constraint exists and includes all statuses
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'offers'::regclass AND conname LIKE '%status%';

-- If missing or incomplete, add/update it:
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_status_check;
ALTER TABLE offers ADD CONSTRAINT offers_status_check
CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired', 'withdrawn'));

-- =====================================================
-- VERIFY NOTIFICATION TYPE CONSTRAINT (if exists)
-- =====================================================

-- Check if there's a constraint on notification type
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'notifications'::regclass AND conname LIKE '%type%';

-- If it exists and doesn't include offer_withdrawn, update it
-- (Only run if constraint exists)
-- ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
-- CHECK (type IN ('outbid', 'auction_ending_soon', ...include all types...));
```

---

## Sign-off

| Test Category | Pass | Fail | Notes |
|---------------|------|------|-------|
| Making Offers | | | |
| Receiving Offers | | | |
| Counter-Offers | | | |
| Withdraw | | | |
| Offer Limit | | | |
| Notifications | | | |
| Edge Cases | | | |
| UI/UX | | | |
| App Store Compliance | | | |

**Tested By:** _______________
**Date:** _______________
**App Version:** _______________
