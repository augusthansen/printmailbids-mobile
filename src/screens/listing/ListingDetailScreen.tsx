import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ListingWithDetails, ListingImage } from '../../types/database';
import { HomeStackParamList } from '../../navigation/types';
import {
  formatCurrency,
  formatTimeRemaining,
  formatDateTime,
  formatWeight,
  formatDimensions,
} from '../../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import ImageGallery from '../../components/ImageGallery';
import { lightTap, mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 320;

type Props = NativeStackScreenProps<HomeStackParamList, 'ListingDetail'>;

export default function ListingDetailScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);
  const [termsExpanded, setTermsExpanded] = useState(false);
  const imageScrollRef = useRef<ScrollView>(null);

  // Fetch listing with all details
  const { data: listing, isLoading, error: queryError, refetch, isRefetching } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      // Simplified query - only join tables that exist
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          images:listing_images(*),
          seller:profiles(*)
        `)
        .eq('id', listingId)
        .single();

      if (error) {
        throw error;
      }

      // Check if user is watching this listing
      if (user) {
        const { data: watchData } = await supabase
          .from('watchlist')
          .select('user_id')
          .eq('user_id', user.id)
          .eq('listing_id', listingId)
          .single();

        (data as ListingWithDetails).is_watched = !!watchData;

        // Get user's current bid if any
        const { data: bidData } = await supabase
          .from('bids')
          .select('*')
          .eq('listing_id', listingId)
          .eq('bidder_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        (data as ListingWithDetails).my_bid = bidData || null;
      }

      return data as ListingWithDetails;
    },
  });

  // Toggle watchlist mutation
  const watchlistMutation = useMutation({
    mutationFn: async (isWatched: boolean) => {
      if (!user) throw new Error('Not authenticated');

      if (isWatched) {
        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('user_id', user.id)
          .eq('listing_id', listingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('watchlist')
          .insert({ user_id: user.id, listing_id: listingId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update watchlist');
    },
  });

  const handleToggleWatchlist = () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to add items to your watchlist');
      return;
    }
    lightTap();
    watchlistMutation.mutate(listing?.is_watched || false);
  };

  const handleShare = async () => {
    if (!listing) return;
    lightTap();
    try {
      await Share.share({
        message: `Check out this listing on PrintMailBids: ${listing.title}`,
        url: `https://printmailbids.com/listings/${listingId}`,
      });
    } catch (error) {
      // User cancelled
    }
  };

  const handlePlaceBid = () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to place a bid');
      return;
    }
    mediumTap();
    navigation.navigate('PlaceBid', { listingId });
  };

  const handleMakeOffer = () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to make an offer');
      return;
    }
    mediumTap();
    navigation.navigate('MakeOffer', { listingId });
  };

  const handleRelist = () => {
    if (!listing) return;
    mediumTap();
    // Navigate to edit listing screen where seller can update dates and relist
    navigation.navigate('ProfileTab' as never, {
      screen: 'EditListing',
      params: { listingId },
    } as never);
  };

  const handleContactSeller = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to message the seller');
      return;
    }
    if (!listing?.seller) return;

    // Check if user is the seller
    if (listing.seller_id === user.id) {
      Alert.alert('Error', "You can't message yourself");
      return;
    }

    mediumTap();

    try {
      // Check if conversation already exists
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('listing_id', listingId)
        .or(`and(participant_1_id.eq.${user.id},participant_2_id.eq.${listing.seller_id}),and(participant_1_id.eq.${listing.seller_id},participant_2_id.eq.${user.id})`)
        .single();

      if (existingConv) {
        // Navigate to existing conversation
        navigation.navigate('MessagesTab' as never, {
          screen: 'Conversation',
          params: { conversationId: existingConv.id },
        } as never);
        return;
      }

      // Create new conversation
      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          listing_id: listingId,
          participant_1_id: user.id,
          participant_2_id: listing.seller_id,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Navigate to new conversation
      navigation.navigate('MessagesTab' as never, {
        screen: 'Conversation',
        params: { conversationId: newConv.id },
      } as never);
    } catch {
      Alert.alert('Error', 'Failed to start conversation. Please try again.');
    }
  };

  const onImageScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveImageIndex(index);
  }, []);

  const openGallery = useCallback((index: number) => {
    lightTap();
    setGalleryInitialIndex(index);
    setGalleryVisible(true);
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  if (!listing || queryError) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <Feather name="alert-circle" size={48} color={themeColors.textMuted} />
        <Text style={[styles.errorText, { color: themeColors.textPrimary }]}>Listing not found</Text>
        {queryError && (
          <Text style={[styles.errorDetail, { color: themeColors.textMuted }]}>{(queryError as Error).message}</Text>
        )}
        <Text style={[styles.errorDetail, { color: themeColors.textMuted }]}>ID: {listingId}</Text>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: themeColors.accent }]} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const images = listing.images?.sort((a, b) => a.sort_order - b.sort_order) || [];
  const isAuction = listing.listing_type === 'auction' || listing.listing_type === 'auction_with_offers';
  const hasOffers = listing.listing_type === 'make_offer' || listing.listing_type === 'auction_with_offers';

  // Check if auction has ended - either by status OR by end_time having passed
  const now = new Date();
  const endTime = listing.end_time ? new Date(listing.end_time) : null;
  const isTimePassed = endTime ? endTime < now : false;
  const hasEnded = listing.status === 'ended' || listing.status === 'sold' || listing.status === 'cancelled' || listing.status === 'expired' || isTimePassed;

  const isSold = listing.status === 'sold';
  const isOwner = user?.id === listing.seller_id;

  // Offers can still be made on ended auctions that didn't sell (no winning bid)
  const canMakeOffer = hasOffers && !isSold && listing.status !== 'cancelled' && !isOwner;

  // Seller can relist if auction ended but didn't sell
  const canRelist = isOwner && hasEnded && !isSold;

  const currentPrice = isAuction ? (listing.current_bid || listing.starting_price) : listing.fixed_price;
  const hasReserve = listing.reserve_price && (!listing.current_bid || listing.current_bid < listing.reserve_price);
  const reserveMet = listing.reserve_price && listing.current_bid && listing.current_bid >= listing.reserve_price;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Back Button - Always Visible */}
      <TouchableOpacity
        style={[styles.floatingButton, styles.backFloating, { top: insets.top + spacing.sm, backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
        onPress={() => navigation.goBack()}
      >
        <Feather name="arrow-left" size={22} color={themeColors.primary} />
      </TouchableOpacity>

      {/* Actions - Always Visible */}
      <View style={[styles.floatingActions, { top: insets.top + spacing.sm }]}>
        <TouchableOpacity style={[styles.floatingButton, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]} onPress={handleShare}>
          <Feather name="share" size={20} color={themeColors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.floatingButton, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
          onPress={handleToggleWatchlist}
          disabled={watchlistMutation.isPending}
        >
          <Feather
            name="heart"
            size={20}
            color={listing.is_watched ? themeColors.error : themeColors.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={themeColors.accent}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Image Carousel */}
        <View style={styles.imageSection}>
          <ScrollView
            ref={imageScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onImageScroll}
            scrollEventThrottle={16}
          >
            {images.length > 0 ? (
              images.map((image: ListingImage, index: number) => (
                <TouchableOpacity
                  key={image.id}
                  activeOpacity={0.9}
                  onPress={() => openGallery(index)}
                >
                  <Image
                    source={{ uri: image.url }}
                    style={styles.mainImage}
                    contentFit="cover"
                    transition={200}
                  />
                  {/* Tap to view hint */}
                  <View style={styles.tapHint}>
                    <Feather name="maximize-2" size={14} color="#ffffff" />
                    <Text style={styles.tapHintText}>Tap to view</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={[styles.mainImage, styles.placeholderImage]}>
                <Feather name="image" size={48} color={colors.textLight} />
              </View>
            )}
          </ScrollView>

          {/* Image Indicators */}
          {images.length > 1 && (
            <View style={styles.imageIndicators}>
              {images.map((_: ListingImage, index: number) => (
                <View
                  key={index}
                  style={[
                    styles.indicator,
                    index === activeImageIndex && styles.indicatorActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Status Badge */}
          {hasEnded && (
            <View style={[styles.endedBadge, isSold && styles.soldBadge]}>
              <Text style={styles.endedBadgeText}>
                {listing.status === 'sold' ? 'SOLD' : listing.status === 'cancelled' ? 'CANCELLED' : 'AUCTION ENDED'}
              </Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={[styles.content, { backgroundColor: themeColors.background }]}>
          {/* Title & Category */}
          <View>
            {listing.category && (
              <Text style={[styles.category, { color: themeColors.accent }]}>{listing.category.name}</Text>
            )}
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>{listing.title}</Text>

            {/* Make & Model */}
            {(listing.make || listing.model) && (
              <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
                {[listing.make, listing.model, listing.year].filter(Boolean).join(' • ')}
              </Text>
            )}
          </View>

          {/* Price Section */}
          <View style={[styles.priceSection, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.priceRow}>
              <View>
                <Text style={[styles.priceLabel, { color: themeColors.textMuted }]}>
                  {isAuction ? (listing.current_bid ? 'Current Bid' : 'Starting Price') : 'Price'}
                </Text>
                <Text style={[styles.price, { color: themeColors.textPrimary }]}>
                  {currentPrice ? formatCurrency(currentPrice) : 'No bids yet'}
                </Text>
              </View>

              {isAuction && (
                <View style={styles.auctionMeta}>
                  {listing.bid_count > 0 && (
                    <View style={styles.metaItem}>
                      <Feather name="users" size={14} color={themeColors.textMuted} />
                      <Text style={[styles.metaText, { color: themeColors.textMuted }]}>{listing.bid_count} bids</Text>
                    </View>
                  )}
                  <View style={styles.metaItem}>
                    <Feather name="eye" size={14} color={themeColors.textMuted} />
                    <Text style={[styles.metaText, { color: themeColors.textMuted }]}>{listing.watch_count} watching</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Reserve Status */}
            {isAuction && (
              <View style={styles.reserveRow}>
                {hasReserve && (
                  <View style={[styles.statusBadge, styles.reserveBadge, { backgroundColor: themeColors.warningLight }]}>
                    <Feather name="lock" size={12} color={themeColors.warning} />
                    <Text style={[styles.reserveText, { color: themeColors.warning }]}>Reserve not met</Text>
                  </View>
                )}
                {reserveMet && (
                  <View style={[styles.statusBadge, styles.reserveMetBadge, { backgroundColor: themeColors.successLight }]}>
                    <Feather name="check-circle" size={12} color={themeColors.success} />
                    <Text style={[styles.reserveMetText, { color: themeColors.success }]}>Reserve met</Text>
                  </View>
                )}
              </View>
            )}

            {/* Time Remaining */}
            {isAuction && !hasEnded && listing.end_time && (
              <View style={styles.timeRow}>
                <Feather name="clock" size={16} color={themeColors.warning} />
                <Text style={[styles.timeLabel, { color: themeColors.textMuted }]}>Time Remaining:</Text>
                <Text style={[styles.timeValue, { color: themeColors.warning }]}>{formatTimeRemaining(listing.end_time)}</Text>
              </View>
            )}

            {/* Your Bid Status */}
            {listing.my_bid && (
              <View style={[
                styles.yourBidRow,
                listing.my_bid.status === 'winning'
                  ? [styles.winningBid, { backgroundColor: themeColors.successLight }]
                  : [styles.outbidBid, { backgroundColor: themeColors.errorLight }]
              ]}>
                <Feather
                  name={listing.my_bid.status === 'winning' ? 'award' : 'alert-circle'}
                  size={16}
                  color={listing.my_bid.status === 'winning' ? themeColors.success : themeColors.error}
                />
                <Text style={[
                  styles.yourBidText,
                  { color: listing.my_bid.status === 'winning' ? themeColors.success : themeColors.error }
                ]}>
                  {listing.my_bid.status === 'winning'
                    ? `You're winning at ${formatCurrency(listing.my_bid.amount)}`
                    : `You've been outbid (your bid: ${formatCurrency(listing.my_bid.amount)})`
                  }
                </Text>
              </View>
            )}
          </View>

          {/* 8% Buyer Premium Notice */}
          <View style={[styles.premiumNotice, { backgroundColor: themeColors.accentFaint }]}>
            <Feather name="info" size={14} color={themeColors.accent} />
            <Text style={[styles.premiumText, { color: themeColors.accent }]}>8% buyer premium applies to all purchases</Text>
          </View>

          {/* Seller Info */}
          {listing.seller && (
            <View style={styles.sellerSection}>
              <TouchableOpacity
                style={[styles.sellerCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                onPress={() => navigation.navigate('SellerProfile', { sellerId: listing.seller!.id })}
              >
                <View style={[styles.sellerAvatar, { backgroundColor: themeColors.sand }]}>
                  {listing.seller.avatar_url ? (
                    <Image source={{ uri: listing.seller.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <Feather name="user" size={24} color={themeColors.textMuted} />
                  )}
                </View>
                <View style={styles.sellerInfo}>
                  <Text style={[styles.sellerName, { color: themeColors.textPrimary }]}>
                    {listing.seller.company_name || listing.seller.full_name || 'Seller'}
                  </Text>
                  {listing.seller.seller_review_count > 0 && (
                    <View style={styles.sellerRating}>
                      <Feather name="star" size={12} color={themeColors.warning} />
                      <Text style={[styles.ratingText, { color: themeColors.textMuted }]}>
                        {listing.seller.seller_rating.toFixed(1)} ({listing.seller.seller_review_count} reviews)
                      </Text>
                    </View>
                  )}
                </View>
                <Feather name="chevron-right" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>

              {/* Contact Seller Button */}
              {listing.seller_id !== user?.id && (
                <TouchableOpacity
                  style={[styles.contactSellerButton, { backgroundColor: themeColors.surface, borderColor: themeColors.accent }]}
                  onPress={handleContactSeller}
                >
                  <Feather name="message-circle" size={18} color={themeColors.accent} />
                  <Text style={[styles.contactSellerText, { color: themeColors.accent }]}>Contact Seller</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Description */}
          {listing.description && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Description</Text>
              <Text style={[styles.description, { color: themeColors.textSecondary }]}>{listing.description}</Text>
            </View>
          )}

          {/* Equipment Details */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Equipment Details</Text>
            <View style={[styles.specsGrid, { backgroundColor: themeColors.surface }]}>
              {listing.make && (
                <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                  <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Make</Text>
                  <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>{listing.make}</Text>
                </View>
              )}
              {listing.model && (
                <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                  <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Model</Text>
                  <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>{listing.model}</Text>
                </View>
              )}
              {listing.year && (
                <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                  <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Year</Text>
                  <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>{listing.year}</Text>
                </View>
              )}
              {listing.serial_number && (
                <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                  <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Serial #</Text>
                  <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>{listing.serial_number}</Text>
                </View>
              )}
              {listing.condition && (
                <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                  <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Condition</Text>
                  <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>{listing.condition}</Text>
                </View>
              )}
              {listing.hours_count && (
                <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                  <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Hours</Text>
                  <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>{listing.hours_count.toLocaleString()}</Text>
                </View>
              )}
              {listing.equipment_status && (
                <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                  <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Status</Text>
                  <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>
                    {listing.equipment_status.replace(/_/g, ' ')}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Dimensions & Weight */}
          {(listing.weight_lbs || listing.length_inches || listing.width_inches || listing.height_inches) && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Dimensions & Weight</Text>
              <View style={[styles.specsGrid, { backgroundColor: themeColors.surface }]}>
                {listing.weight_lbs && (
                  <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                    <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Weight</Text>
                    <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>{formatWeight(listing.weight_lbs)}</Text>
                  </View>
                )}
                {(listing.length_inches || listing.width_inches || listing.height_inches) && (
                  <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                    <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Dimensions</Text>
                    <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>
                      {formatDimensions(listing.length_inches, listing.width_inches, listing.height_inches)}
                    </Text>
                  </View>
                )}
                {listing.floor_length_ft && listing.floor_width_ft && (
                  <View style={[styles.specItem, { borderColor: themeColors.border }]}>
                    <Text style={[styles.specLabel, { color: themeColors.textMuted }]}>Floor Space</Text>
                    <Text style={[styles.specValue, { color: themeColors.textPrimary }]}>
                      {listing.floor_length_ft}' x {listing.floor_width_ft}'
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Location & Logistics */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Location & Pickup</Text>
            <View style={[styles.logisticsCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              {listing.location && (
                <View style={styles.logisticsRow}>
                  <Feather name="map-pin" size={16} color={themeColors.accent} />
                  <View>
                    <Text style={[styles.logisticsLabel, { color: themeColors.textMuted }]}>Location</Text>
                    <Text style={[styles.logisticsValue, { color: themeColors.textPrimary }]}>
                      {listing.location.city}, {listing.location.state}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.logisticsRow}>
                <Feather name="tool" size={16} color={themeColors.accent} />
                <View>
                  <Text style={[styles.logisticsLabel, { color: themeColors.textMuted }]}>Deinstallation</Text>
                  <Text style={[styles.logisticsValue, { color: themeColors.textPrimary }]}>
                    {listing.deinstall_responsibility === 'buyer'
                      ? 'Buyer responsible'
                      : listing.deinstall_responsibility === 'seller_included'
                      ? 'Seller will handle (included)'
                      : `Seller available (+${formatCurrency(listing.deinstall_fee || 0)})`}
                  </Text>
                </View>
              </View>
              {listing.removal_deadline && (
                <View style={styles.logisticsRow}>
                  <Feather name="calendar" size={16} color={themeColors.accent} />
                  <View>
                    <Text style={[styles.logisticsLabel, { color: themeColors.textMuted }]}>Removal Deadline</Text>
                    <Text style={[styles.logisticsValue, { color: themeColors.textPrimary }]}>
                      {formatDateTime(listing.removal_deadline)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Payment Methods */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Payment Methods</Text>
            <View style={styles.paymentMethods}>
              {listing.accepts_credit_card && (
                <View style={[styles.paymentBadge, { backgroundColor: themeColors.sand }]}>
                  <Feather name="credit-card" size={14} color={themeColors.accent} />
                  <Text style={[styles.paymentText, { color: themeColors.textPrimary }]}>Credit Card</Text>
                </View>
              )}
              {listing.accepts_ach && (
                <View style={[styles.paymentBadge, { backgroundColor: themeColors.sand }]}>
                  <Feather name="dollar-sign" size={14} color={themeColors.accent} />
                  <Text style={[styles.paymentText, { color: themeColors.textPrimary }]}>ACH</Text>
                </View>
              )}
              {listing.accepts_wire && (
                <View style={[styles.paymentBadge, { backgroundColor: themeColors.sand }]}>
                  <Feather name="send" size={14} color={themeColors.accent} />
                  <Text style={[styles.paymentText, { color: themeColors.textPrimary }]}>Wire</Text>
                </View>
              )}
              {listing.accepts_check && (
                <View style={[styles.paymentBadge, { backgroundColor: themeColors.sand }]}>
                  <Feather name="file-text" size={14} color={themeColors.accent} />
                  <Text style={[styles.paymentText, { color: themeColors.textPrimary }]}>Check</Text>
                </View>
              )}
            </View>
            <Text style={[styles.paymentDue, { color: themeColors.textMuted }]}>
              Payment due within {listing.payment_due_days} days of purchase
            </Text>
          </View>

          {/* Seller Terms - Collapsible */}
          {listing.seller_terms && (
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.termsHeader, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                onPress={() => {
                  lightTap();
                  setTermsExpanded(!termsExpanded);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionTitle, { color: themeColors.textPrimary, marginBottom: 0 }]}>Seller Terms</Text>
                <Feather
                  name={termsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={themeColors.textMuted}
                />
              </TouchableOpacity>
              {termsExpanded && (
                <ScrollView
                  style={[styles.termsScrollContainer, { backgroundColor: themeColors.sand, borderColor: themeColors.border }]}
                  nestedScrollEnabled
                >
                  <Text style={[styles.terms, { color: themeColors.textSecondary, backgroundColor: 'transparent' }]}>
                    {listing.seller_terms}
                  </Text>
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      {(!hasEnded || canMakeOffer || canRelist) && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.md, backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
          <View style={styles.actionButtons}>
            {/* Place Bid - only show if auction is active (not ended) and user is not owner */}
            {isAuction && !hasEnded && !isOwner && (
              <TouchableOpacity
                style={[styles.actionButton, styles.bidButton, { backgroundColor: themeColors.accent }, hasOffers && { flex: 1 }]}
                onPress={handlePlaceBid}
              >
                <Feather name="trending-up" size={18} color="#ffffff" />
                <Text style={styles.bidButtonText}>Place Bid</Text>
              </TouchableOpacity>
            )}
            {/* Make Offer - show if listing accepts offers and is not sold/cancelled and user is not owner */}
            {canMakeOffer && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  // If auction ended but offers still available, make it the primary button
                  (isAuction && !hasEnded)
                    ? [styles.offerButton, { backgroundColor: themeColors.surface, borderColor: themeColors.primary }]
                    : [styles.bidButton, { backgroundColor: themeColors.accent }],
                  (isAuction && !hasEnded) && { flex: 1 }
                ]}
                onPress={handleMakeOffer}
              >
                <Feather name="message-square" size={18} color={(isAuction && !hasEnded) ? themeColors.primary : "#ffffff"} />
                <Text style={(isAuction && !hasEnded) ? [styles.offerButtonText, { color: themeColors.primary }] : styles.bidButtonText}>
                  Make An Offer
                </Text>
              </TouchableOpacity>
            )}
            {/* Relist - only show for owner when auction ended but not sold */}
            {canRelist && (
              <TouchableOpacity
                style={[styles.actionButton, styles.bidButton, { backgroundColor: themeColors.accent }]}
                onPress={handleRelist}
              >
                <Feather name="refresh-cw" size={18} color="#ffffff" />
                <Text style={styles.bidButtonText}>Edit & Relist</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Full-screen Image Gallery Modal */}
      <ImageGallery
        images={images.map((img: ListingImage) => ({
          id: img.id,
          url: img.url,
          thumbnail_url: img.thumbnail_url,
          alt_text: img.alt_text,
        }))}
        initialIndex={galleryInitialIndex}
        visible={galleryVisible}
        onClose={() => setGalleryVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  errorDetail: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  backButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
  },
  backButtonText: {
    color: colors.white,
    fontWeight: fontWeight.semibold,
  },
  floatingButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.md,
  },
  backFloating: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 101,
  },
  floatingActions: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 101,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  imageSection: {
    position: 'relative',
  },
  mainImage: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: colors.sand,
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapHint: {
    position: 'absolute',
    bottom: spacing.lg + 24,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  tapHintText: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  imageIndicators: {
    position: 'absolute',
    bottom: spacing.lg,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  indicatorActive: {
    backgroundColor: colors.white,
    width: 24,
  },
  endedBadge: {
    position: 'absolute',
    top: IMAGE_HEIGHT / 2 - 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  soldBadge: {
    // Additional styles for sold items
  },
  endedBadgeText: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.white,
    letterSpacing: 2,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  content: {
    padding: spacing.lg,
  },
  category: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  priceSection: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  priceLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  price: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  auctionMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  reserveRow: {
    marginTop: spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignSelf: 'flex-start',
  },
  reserveBadge: {
    backgroundColor: colors.warningLight,
  },
  reserveText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  reserveMetBadge: {
    backgroundColor: colors.successLight,
  },
  reserveMetText: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: fontWeight.medium,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timeLabel: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  timeValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.warning,
  },
  yourBidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  winningBid: {
    backgroundColor: colors.successLight,
  },
  outbidBid: {
    backgroundColor: colors.errorLight,
  },
  yourBidText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  premiumNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.accentFaint,
    borderRadius: borderRadius.lg,
  },
  premiumText: {
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  sellerSection: {
    marginTop: spacing.xl,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  contactSellerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  contactSellerText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  sellerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  sellerRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ratingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  description: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  specsGrid: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  specItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  specLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  specValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  logisticsCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadows.sm,
  },
  logisticsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  logisticsLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  logisticsValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accentFaint,
    borderRadius: borderRadius.md,
  },
  paymentText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
  paymentDue: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  termsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  termsScrollContainer: {
    maxHeight: 200,
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  terms: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    lineHeight: 24,
    padding: spacing.lg,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  bidButton: {
    backgroundColor: colors.accent,
  },
  bidButtonText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  offerButton: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  offerButtonText: {
    color: colors.primary,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
