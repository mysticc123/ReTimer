import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Modal,
  Pressable,
  useWindowDimensions,
  AppState,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore, useTimerStore } from '../store';
import { PressableScale } from '../components/PressableScale';
import { formatDurationShort } from '../utils/durationFormat';
import { startOfDay } from '../utils/analytics';
import { buildSections, type HistorySection } from '../utils/history';
import { spacing, typography, borderRadius } from '../theme/colors';
import type { FocusSession } from '../types';

type RootStackParamList = {
  Landing: undefined;
  History: undefined;
  Analytics: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** Time only, device locale: "2:30 PM". */
function formatTimeOnly(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Date + time, device locale: "Sep 14, 2:30 PM". */
function formatDateTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const datePart = date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  return `${datePart}, ${formatTimeOnly(timestampMs)}`;
}

/**
 * Primary row label derived only from FocusSession fields.
 * Pomodoro → "Focus • 25m", Countdown → "Countdown • 10m",
 * Interval → "Work R2/8 • 30s".
 */
function sessionTitle(session: FocusSession): string {
  const duration = formatDurationShort(session.actualDurationMs);
  if (session.mode === 'interval') {
    const round =
      typeof session.round === 'number' &&
      typeof session.totalRounds === 'number'
        ? ` R${session.round + 1}/${session.totalRounds}`
        : '';
    return `Work${round} • ${duration}`;
  }
  if (session.mode === 'pomodoro') {
    return `Focus • ${duration}`;
  }
  return `Countdown • ${duration}`;
}

/**
 * Builds the full title with optional label prefix.
 * Returns "Label\nTitle" if label exists, otherwise just Title.
 */
function sessionTitleWithLabel(session: FocusSession): string {
  const title = sessionTitle(session);
  if (session.label) {
    return `${session.label}\n${title}`;
  }
  return title;
}

export const HistoryScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, accentColor, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Narrow selectors: re-render only when history or relevant settings change.
  const sessions = useTimerStore((state) => state.sessions);
  const clearSessionHistory = useTimerStore((state) => state.clearSessionHistory);
  const reducedMotion = useSettingsStore((state) => state.settings.reducedMotion);
  const hapticsEnabled = useSettingsStore((state) => state.settings.hapticsEnabled);

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Local-calendar-day refresh token. The section buckets are date-relative,
  // so a screen mounted across midnight must recompute even when `sessions`
  // is unchanged. The token only changes when the local day changes, so
  // ordinary foreground/focus events never cause an extra render.
  const [dayKey, setDayKey] = useState(() => startOfDay(Date.now()));
  const refreshDayKey = useCallback(() => {
    const key = startOfDay(Date.now());
    setDayKey((prev) => (prev === key ? prev : key));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshDayKey();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshDayKey]);

  useFocusEffect(
    useCallback(() => {
      refreshDayKey();
    }, [refreshDayKey])
  );

  const sections = useMemo(() => buildSections(sessions), [sessions, dayKey]);
  const totalFocusedMs = useMemo(
    () => sessions.reduce((sum, session) => sum + session.actualDurationMs, 0),
    [sessions]
  );

  const handleClearPress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setConfirmOpen(true);
  };

  const handleConfirmClear = () => {
    // Clears sessions[] only — timer state and settings are untouched
    // (clearSessionHistory sets { sessions: [] } and nothing else).
    clearSessionHistory();
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    setConfirmOpen(false);
  };

  const renderItem = ({ item, section }: { item: FocusSession; section: HistorySection }) => {
    const isEarlier = section.title === 'Earlier';
    const detail = isEarlier
      ? formatDateTime(item.completedAtMs)
      : formatTimeOnly(item.completedAtMs);
    return (
      <View
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityLabel={`${sessionTitleWithLabel(item)}, completed ${detail}`}
      >
        <Text
          style={[
            styles.rowTitle,
            {
              color: colors.primaryText,
              fontSize: typography.fontSizes.md,
              fontFamily: resolveTypeface(fontFamily, '500'),
            },
          ]}
        >
          {sessionTitleWithLabel(item)}
        </Text>
        <Text
          style={[
            styles.rowDetail,
            {
              color: colors.secondaryText,
              fontSize: typography.fontSizes.sm,
              fontFamily: resolveTypeface(fontFamily, '400'),
            },
          ]}
        >
          {detail}
        </Text>
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: HistorySection }) => (
    <Text
      style={[
        styles.sectionTitle,
        {
          color: colors.secondaryText,
          fontSize: typography.fontSizes.sm,
          fontFamily: resolveTypeface(fontFamily, '600'),
          backgroundColor: colors.background,
        },
      ]}
    >
      {section.title.toUpperCase()}
    </Text>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingBottom: insets.bottom,
          paddingLeft: isLandscape ? Math.max(insets.left, spacing.md) : undefined,
          paddingRight: isLandscape ? Math.max(insets.right, spacing.md) : undefined,
        },
      ]}
    >
      {/* Header (SettingsScreen pattern: back / title / action) */}
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
        >
          <Text
            style={[
              styles.backButton,
              {
                color: accentColor,
                fontFamily: resolveTypeface(fontFamily, '500'),
                fontSize: typography.fontSizes.md,
              },
            ]}
          >
            ← Back
          </Text>
        </PressableScale>

        <Text
          style={[
            styles.title,
            {
              color: colors.primaryText,
              fontFamily: resolveTypeface(fontFamily, '600'),
              fontSize: typography.fontSizes.xl,
            },
          ]}
        >
          History
        </Text>

        {sessions.length > 0 ? (
          <View style={styles.headerActions}>
            <PressableScale
              onPress={() => navigation.navigate('Analytics')}
              accessibilityLabel="Open analytics"
              accessibilityRole="button"
              hitSlop={{ top: 14, bottom: 14, left: 12, right: 8 }}
            >
              <Text
                style={[
                  styles.headerAction,
                  {
                    color: accentColor,
                    fontFamily: resolveTypeface(fontFamily, '500'),
                    fontSize: typography.fontSizes.md,
                  },
                ]}
              >
                Stats
              </Text>
            </PressableScale>
            <PressableScale
              onPress={handleClearPress}
              accessibilityLabel="Clear session history"
              accessibilityRole="button"
              hitSlop={{ top: 14, bottom: 14, left: 8, right: 12 }}
            >
              <Text
                style={[
                  styles.headerAction,
                  {
                    color: accentColor,
                    fontFamily: resolveTypeface(fontFamily, '500'),
                    fontSize: typography.fontSizes.md,
                  },
                ]}
              >
                Clear
              </Text>
            </PressableScale>
          </View>
        ) : (
          <PressableScale
            onPress={() => navigation.navigate('Analytics')}
            accessibilityLabel="Open analytics"
            accessibilityRole="button"
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
          >
            <Text
              style={[
                styles.headerAction,
                {
                  color: accentColor,
                  fontFamily: resolveTypeface(fontFamily, '500'),
                  fontSize: typography.fontSizes.md,
                },
              ]}
            >
              Stats
            </Text>
          </PressableScale>
        )}
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text
            style={[
              styles.emptyTitle,
              {
                color: colors.primaryText,
                fontFamily: resolveTypeface(fontFamily, '600'),
                fontSize: typography.fontSizes.lg,
              },
            ]}
          >
            No completed sessions yet
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(fontFamily, '400'),
                fontSize: typography.fontSizes.md,
              },
            ]}
          >
            Finished focus sessions will appear here.
          </Text>
          <PressableScale
            onPress={() => navigation.goBack()}
            accessibilityLabel="Start a timer"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.emptyButton}
          >
            <Text
              style={[
                styles.emptyButtonText,
                {
                  color: accentColor,
                  fontFamily: resolveTypeface(fontFamily, '500'),
                  fontSize: typography.fontSizes.md,
                },
              ]}
            >
              Start a timer
            </Text>
          </PressableScale>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={7}
          ListHeaderComponent={
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.summaryStat}>
                <Text
                  style={[
                    styles.summaryValue,
                    {
                      color: colors.primaryText,
                      fontFamily: resolveTypeface(fontFamily, '700'),
                      fontSize: typography.fontSizes.xl,
                    },
                  ]}
                >
                  {sessions.length}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    {
                      color: colors.secondaryText,
                      fontFamily: resolveTypeface(fontFamily, '400'),
                      fontSize: typography.fontSizes.sm,
                    },
                  ]}
                >
                  Sessions
                </Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryStat}>
                <Text
                  style={[
                    styles.summaryValue,
                    {
                      color: colors.primaryText,
                      fontFamily: resolveTypeface(fontFamily, '700'),
                      fontSize: typography.fontSizes.xl,
                    },
                  ]}
                >
                  {formatDurationShort(totalFocusedMs)}
                </Text>
                <Text
                  style={[
                    styles.summaryLabel,
                    {
                      color: colors.secondaryText,
                      fontFamily: resolveTypeface(fontFamily, '400'),
                      fontSize: typography.fontSizes.sm,
                    },
                  ]}
                >
                  Focused time
                </Text>
              </View>
            </View>
          }
        />
      )}

      {/* Destructive-confirm modal (EditorModalShell chrome, Delete/Cancel). */}
      <Modal
        visible={confirmOpen}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setConfirmOpen(false)}
        accessibilityViewIsModal
      >
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={reducedMotion ? undefined : FadeOut.duration(150)}
          style={styles.backdrop}
        >
          <Pressable
            style={styles.backdropPress}
            onPress={() => setConfirmOpen(false)}
            accessibilityLabel="Cancel clearing history"
            accessibilityRole="button"
          />
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(150)}
            exiting={reducedMotion ? undefined : FadeOut.duration(150)}
            style={[
              styles.confirmCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.confirmTitle,
                {
                  color: colors.primaryText,
                  fontSize: typography.fontSizes.lg,
                  fontFamily: resolveTypeface(fontFamily, '600'),
                },
              ]}
            >
              Clear history?
            </Text>
            <Text
              style={[
                styles.confirmMessage,
                {
                  color: colors.secondaryText,
                  fontSize: typography.fontSizes.md,
                  fontFamily: resolveTypeface(fontFamily, '400'),
                },
              ]}
            >
              This deletes all completed session history. Timer settings are not affected.
            </Text>
            <View style={styles.buttonsRow}>
              <PressableScale
                onPress={() => setConfirmOpen(false)}
                accessibilityLabel="Cancel clearing history"
                accessibilityRole="button"
                style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    {
                      color: colors.secondaryText,
                      fontSize: typography.fontSizes.md,
                      fontFamily: resolveTypeface(fontFamily, '600'),
                    },
                  ]}
                >
                  Cancel
                </Text>
              </PressableScale>
              <PressableScale
                onPress={handleConfirmClear}
                accessibilityLabel="Confirm clear session history"
                accessibilityRole="button"
                style={[styles.button, styles.deleteButton]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    styles.deleteButtonText,
                    {
                      fontSize: typography.fontSizes.md,
                      fontFamily: resolveTypeface(fontFamily, '600'),
                    },
                  ]}
                >
                  Delete
                </Text>
              </PressableScale>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerSpacer: {
    width: 60,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backButton: {
    fontWeight: typography.fontWeights.medium,
  },
  title: {
    fontWeight: typography.fontWeights.semibold,
  },
  headerAction: {
    fontWeight: typography.fontWeights.medium,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontWeight: typography.fontWeights.bold,
  },
  summaryLabel: {
    marginTop: spacing.xs,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
  },
  sectionTitle: {
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 0.5,
    paddingVertical: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTitle: {
    fontWeight: typography.fontWeights.medium,
  },
  rowDetail: {
    marginTop: spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emptyButtonText: {
    fontWeight: typography.fontWeights.medium,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdropPress: {
    ...StyleSheet.absoluteFill,
  },
  confirmCard: {
    width: '85%',
    maxWidth: 340,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  confirmTitle: {
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  confirmMessage: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontWeight: typography.fontWeights.semibold,
  },
  deleteButton: {
    backgroundColor: '#FF4444',
  },
  deleteButtonText: {
    color: '#FFFFFF',
  },
});
