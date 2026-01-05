import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  FlatList,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import { lightTap } from '../utils/haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImageItem {
  id: string;
  url: string;
  thumbnail_url?: string | null;
  alt_text?: string | null;
}

interface ImageGalleryProps {
  images: ImageItem[];
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
}

export default function ImageGallery({
  images,
  initialIndex = 0,
  visible,
  onClose,
}: ImageGalleryProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList>(null);

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Scroll to initial index
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false,
        });
      }, 100);
    }
  }, [visible, initialIndex]);

  const handleClose = useCallback(() => {
    lightTap();
    onClose();
  }, [onClose]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const goToIndex = useCallback((index: number) => {
    lightTap();
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const renderImage = useCallback(
    ({ item }: { item: ImageItem }) => (
      <View style={styles.imageContainer}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bouncesZoom={true}
          centerContent={true}
        >
          <Image
            source={{ uri: item.url }}
            style={styles.fullImage}
            contentFit="contain"
            transition={200}
          />
        </ScrollView>
      </View>
    ),
    []
  );

  const renderThumbnail = useCallback(
    ({ item, index }: { item: ImageItem; index: number }) => (
      <TouchableOpacity
        onPress={() => goToIndex(index)}
        style={[
          styles.thumbnail,
          currentIndex === index && styles.thumbnailActive,
        ]}
      >
        <Image
          source={{ uri: item.thumbnail_url || item.url }}
          style={styles.thumbnailImage}
          contentFit="cover"
        />
        {currentIndex === index && <View style={styles.thumbnailOverlay} />}
      </TouchableOpacity>
    ),
    [currentIndex, goToIndex]
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Main Image Gallery */}
        <FlatList
          ref={flatListRef}
          data={images}
          renderItem={renderImage}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          initialScrollIndex={initialIndex}
          onScrollToIndexFailed={() => {}}
        />

        {/* Top Controls */}
        <View
          style={[
            styles.topControls,
            { paddingTop: insets.top + spacing.md },
          ]}
        >
          <View style={styles.topControlsContent}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.counter}>
              {currentIndex + 1} / {images.length}
            </Text>
            <View style={styles.placeholder} />
          </View>
        </View>

        {/* Bottom Thumbnails */}
        {images.length > 1 && (
          <View
            style={[
              styles.bottomControls,
              { paddingBottom: insets.bottom + spacing.md },
            ]}
          >
            <FlatList
              data={images}
              renderItem={renderThumbnail}
              keyExtractor={(item) => `thumb-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailList}
            />
          </View>
        )}

        {/* Zoom Hint */}
        <View
          style={[
            styles.swipeHint,
            {
              bottom: insets.bottom + (images.length > 1 ? 120 : 40),
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.swipeHintText}>Pinch to zoom • Swipe to navigate</Text>
        </View>
      </View>
    </Modal>
  );
}

// Thumbnail strip component for use in listing detail
interface ThumbnailStripProps {
  images: ImageItem[];
  onImagePress: (index: number) => void;
  currentIndex?: number;
}

export function ThumbnailStrip({ images, onImagePress, currentIndex = 0 }: ThumbnailStripProps) {
  if (images.length <= 1) return null;

  return (
    <FlatList
      data={images}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stripContainer}
      renderItem={({ item, index }) => (
        <TouchableOpacity
          onPress={() => {
            lightTap();
            onImagePress(index);
          }}
          style={[
            styles.stripThumbnail,
            currentIndex === index && styles.stripThumbnailActive,
          ]}
        >
          <Image
            source={{ uri: item.thumbnail_url || item.url }}
            style={styles.stripThumbnailImage}
            contentFit="cover"
          />
        </TouchableOpacity>
      )}
      keyExtractor={(item) => `strip-${item.id}`}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  scrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topControlsContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 44,
    height: 44,
  },
  counter: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  thumbnailList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailActive: {
    borderColor: '#ffffff',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  swipeHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  swipeHintText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSize.xs,
  },
  // Thumbnail Strip styles (for listing detail)
  stripContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  stripThumbnail: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stripThumbnailActive: {
    borderColor: '#2563eb',
  },
  stripThumbnailImage: {
    width: '100%',
    height: '100%',
  },
});
