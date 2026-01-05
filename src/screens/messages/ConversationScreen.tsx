import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Message, Profile, Listing } from '../../types/database';
import { MessagesStackParamList } from '../../navigation/types';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { lightTap, successFeedback } from '../../utils/haptics';

type Props = NativeStackScreenProps<MessagesStackParamList, 'Conversation'>;

interface MessageWithSender extends Message {
  sender?: Profile;
}

interface ConversationData {
  id: string;
  listing?: Listing;
  other_participant?: Profile;
  messages: MessageWithSender[];
}

export default function ConversationScreen({ route, navigation }: Props) {
  const { conversationId, otherUserId, listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  const [messageText, setMessageText] = useState('');

  // Fetch conversation and messages
  const { data: conversation, isLoading } = useQuery<ConversationData>({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      // Get conversation details
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`
          *,
          listing:listings(id, title),
          participant_1:profiles!participant_1_id(id, full_name, company_name, avatar_url),
          participant_2:profiles!participant_2_id(id, full_name, company_name, avatar_url)
        `)
        .eq('id', conversationId)
        .single();

      if (convError) throw convError;

      // Get messages
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!sender_id(id, full_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      // Determine other participant
      const otherParticipant = convData.participant_1?.id === user?.id
        ? convData.participant_2
        : convData.participant_1;

      // Mark messages as read
      if (user) {
        await supabase
          .from('messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('conversation_id', conversationId)
          .neq('sender_id', user.id)
          .eq('is_read', false);
      }

      return {
        id: convData.id,
        listing: convData.listing,
        other_participant: otherParticipant,
        messages: messages || [],
      };
    },
    refetchInterval: 5000, // Poll for new messages every 5 seconds
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    },
    onSuccess: () => {
      successFeedback();
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const handleSend = () => {
    if (!messageText.trim()) return;
    lightTap();
    sendMessageMutation.mutate(messageText);
  };

  // Set navigation title
  useEffect(() => {
    if (conversation?.other_participant) {
      navigation.setOptions({
        title: conversation.other_participant.company_name ||
               conversation.other_participant.full_name ||
               'Chat',
      });
    }
  }, [conversation, navigation]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (conversation?.messages.length) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [conversation?.messages.length]);

  const renderMessage = useCallback(({ item, index }: { item: MessageWithSender; index: number }) => {
    const isOwnMessage = item.sender_id === user?.id;
    const showAvatar = !isOwnMessage && (
      index === 0 ||
      conversation?.messages[index - 1]?.sender_id !== item.sender_id
    );

    return (
      <View style={[
        styles.messageRow,
        isOwnMessage ? styles.ownMessageRow : styles.otherMessageRow,
      ]}>
        {!isOwnMessage && (
          <View style={styles.avatarContainer}>
            {showAvatar ? (
              item.sender?.avatar_url ? (
                <Image source={{ uri: item.sender.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: themeColors.sand }]}>
                  <Feather name="user" size={14} color={themeColors.textMuted} />
                </View>
              )
            ) : (
              <View style={styles.avatarSpacer} />
            )}
          </View>
        )}

        <View style={[
          styles.messageBubble,
          isOwnMessage
            ? [styles.ownBubble, { backgroundColor: themeColors.accent }]
            : [styles.otherBubble, { backgroundColor: themeColors.surface }],
        ]}>
          <Text style={[
            styles.messageText,
            isOwnMessage ? styles.ownMessageText : { color: themeColors.textPrimary },
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.messageTime,
            isOwnMessage ? styles.ownMessageTime : { color: themeColors.textLight },
          ]}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  }, [user?.id, conversation?.messages, themeColors]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Listing Context */}
      {conversation?.listing && (
        <View style={[styles.listingContext, { backgroundColor: isDark ? themeColors.sand : themeColors.accentFaint, borderBottomColor: themeColors.border }]}>
          <Feather name="package" size={16} color={themeColors.accent} />
          <Text style={[styles.listingTitle, { color: themeColors.accent }]} numberOfLines={1}>
            Re: {conversation.listing.title}
          </Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={conversation?.messages || []}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messagesList,
          { paddingBottom: insets.bottom + 70 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="message-circle" size={48} color={themeColors.textLight} />
            <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>Start the conversation</Text>
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
              Send a message to get started
            </Text>
          </View>
        }
      />

      {/* Input Bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.md, backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.sand, color: themeColors.textPrimary }]}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Type a message..."
            placeholderTextColor={themeColors.textLight}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: themeColors.accent },
              (!messageText.trim() || sendMessageMutation.isPending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!messageText.trim() || sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Feather name="send" size={18} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  listingContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.accentFaint,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listingTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
  messagesList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    alignItems: 'flex-end',
  },
  ownMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginRight: spacing.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSpacer: {
    width: 28,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
  },
  ownBubble: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: spacing.xs,
  },
  otherBubble: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: spacing.xs,
    ...shadows.sm,
  },
  messageText: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  ownMessageText: {
    color: colors.white,
  },
  otherMessageText: {
    color: colors.textPrimary,
  },
  messageTime: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  ownMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  otherMessageTime: {
    color: colors.textLight,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  inputBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.sand,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
