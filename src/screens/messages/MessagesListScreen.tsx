import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { MessagesStackParamList } from '../../navigation/types';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ConversationWithDetails } from '../../types/database';
import { formatRelativeTime } from '../../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { Feather } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';

export default function MessagesListScreen() {
  const navigation = useNavigation<NavigationProp<MessagesStackParamList>>();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();

  const { data: conversations, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          listing:listings(id, title),
          messages(id, content, sender_id, is_read, created_at)
        `)
        .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Get other participant profiles
      const otherParticipantIds = data.map(conv =>
        conv.participant_1_id === user.id ? conv.participant_2_id : conv.participant_1_id
      );

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, company_name, avatar_url')
        .in('id', otherParticipantIds);

      const profileMap = new Map(
        (profiles || []).map(p => [p.id, p] as const)
      );

      return data.map(conv => {
        const otherParticipantId = conv.participant_1_id === user.id
          ? conv.participant_2_id
          : conv.participant_1_id;

        const lastMessage = conv.messages?.sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        const unreadCount = conv.messages?.filter((m: any) =>
          m.sender_id !== user.id && !m.is_read
        ).length || 0;

        return {
          ...conv,
          other_participant: profileMap.get(otherParticipantId),
          last_message: lastMessage,
          unread_count: unreadCount,
        } as ConversationWithDetails;
      });
    },
    enabled: !!user,
  });

  const renderItem = ({ item }: { item: ConversationWithDetails }) => {
    const displayName = item.other_participant?.company_name ||
                       item.other_participant?.full_name ||
                       'Unknown User';

    return (
      <TouchableOpacity
        style={[styles.conversationItem, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
        onPress={() => navigation.navigate('Conversation', {
          conversationId: item.id
        })}
      >
        <Avatar url={item.other_participant?.avatar_url} size="md" />
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.participantName, { color: themeColors.textPrimary }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.timestamp, { color: themeColors.textLight }]}>
              {item.last_message ? formatRelativeTime(item.last_message.created_at) : ''}
            </Text>
          </View>

          {item.listing && item.listing.title ? (
            <Text style={[styles.listingTitle, { color: themeColors.accent }]} numberOfLines={1}>
              {`Re: ${item.listing.title}`}
            </Text>
          ) : null}

          <View style={styles.messageRow}>
            <Text
              style={[
                styles.lastMessage,
                { color: (item.unread_count ?? 0) > 0 ? themeColors.textPrimary : themeColors.textMuted },
                (item.unread_count ?? 0) > 0 ? styles.unreadMessage : undefined,
              ]}
              numberOfLines={1}
            >
              {item.last_message?.content || 'No messages yet'}
            </Text>
            {item.unread_count && item.unread_count > 0 ? (
              <View style={[styles.unreadBadge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.unreadCount}>{item.unread_count}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={themeColors.accent} />
        }
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: themeColors.borderLight }]} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="message-circle" size={48} color={themeColors.textLight} />
            <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No Messages</Text>
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
              When you message a seller or receive a message, it will appear here
            </Text>
          </View>
        }
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
  },
  listContent: {
    flexGrow: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.sand,
    marginRight: spacing.md,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  participantName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  listingTitle: {
    fontSize: fontSize.sm,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    flex: 1,
  },
  unreadMessage: {
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  unreadBadge: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  unreadCount: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: 6,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 50 + spacing.md + spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    paddingHorizontal: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
