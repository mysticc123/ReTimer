import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, AppState } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, resolveTypeface } from '../theme';
import { useTimerStore, useSettingsStore } from '../store';
import { PressableScale } from '../components/PressableScale';
import { formatDurationShort } from '../utils/durationFormat';
import { startOfDay, buildWeeklySummary, buildMonthlySummary, filterValidSessions } from '../utils/analytics';
import { buildAnalyticsViewModel } from '../utils/analyticsViewModel';
import { buildWeeklyChartData, buildMonthlyChartData, formatFocusedShort } from '../utils/analyticsChartData';
import { CALENDAR_COLUMNS, computeCalendarCellSize } from '../utils/calendarLayout';
import { spacing, typography, borderRadius, colors as themeColors } from '../theme/colors';
import type { WeeklyChartDay, MonthlyChartDay } from '../utils/analyticsChartData';
import type { DailyGoalProgress } from '../utils/analyticsViewModel';

const INTENSITY_LEVELS = 4;

type RootStackParamList = {
  Landing: undefined;
  History: undefined;
  Analytics: undefined;
};

const GOAL_MIN_MS = 15 * 60 * 1000; // 15 minutes minimum
const GOAL_MAX_MS = 12 * 60 * 60 * 1000; // 12 hours maximum

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface StatProps {
  value: string;
  label: string;
}

/**
 * Analytics dashboard built entirely on src/utils/analytics.ts via the
 * view model. Re-renders whenever persisted history changes (Zustand
 * selector on sessions); each render derives fresh values from Date.now(),
 * so the screen is always current when opened or revisited. No caching,
 * no polling, no second persistence path.
 */
export const AnalyticsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors, accentColor, fontFamily } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Deterministic Monday..Sunday calendar cell size: the monthly grid renders
  // exactly CALENDAR_COLUMNS equal columns per row with explicit widths (flex +
  // aspectRatio collapses cells in a flex-wrap row). Same width is applied to
  // the weekday header so labels align with the date cells.
  const calendarCellSize = useMemo(
    () =>
      computeCalendarCellSize({
        screenWidth: width,
        contentPadding: spacing.lg,
        containerBorderWidth: 1,
        gridPadding: spacing.sm,
        cellMargin: 1,
      }),
    [width]
  );

  const sessions = useTimerStore((state) => state.sessions);

  // Local-calendar-day refresh token. Every displayed metric is
  // date-relative, so a screen mounted across midnight must recompute even
  // when `sessions` is unchanged. The token only changes when the local day
  // changes, so ordinary foreground/focus events never cause an extra render.
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

  const { settings } = useSettingsStore();

  const viewModel = useMemo(
    () => buildAnalyticsViewModel(sessions, dayKey, settings.dailyFocusGoalMs),
    [sessions, dayKey, settings.dailyFocusGoalMs]
  );

  // Compute full PeriodSummary objects for chart data
  const weeklySummary = useMemo(
    () => buildWeeklySummary(filterValidSessions(sessions), dayKey),
    [sessions, dayKey]
  );

  const monthlySummary = useMemo(
    () => buildMonthlySummary(filterValidSessions(sessions), dayKey),
    [sessions, dayKey]
  );

  const weeklyChartData = useMemo(
    () => buildWeeklyChartData(weeklySummary, dayKey),
    [weeklySummary, dayKey]
  );

  const monthlyChartData = useMemo(
    () => buildMonthlyChartData(monthlySummary, dayKey),
    [monthlySummary, dayKey]
  );

  const renderStat = ({ value, label }: StatProps) => (
    <View style={styles.stat} accessibilityLabel={`${label}, ${value}`}>
      <Text
        style={[
          styles.statValue,
          {
            color: colors.primaryText,
            fontFamily: resolveTypeface(fontFamily, '700'),
            fontSize: typography.fontSizes.xl,
          },
        ]}
      >
        {value}
      </Text>
      <Text
        style={[
          styles.statLabel,
          {
            color: colors.secondaryText,
            fontFamily: resolveTypeface(fontFamily, '400'),
            fontSize: typography.fontSizes.sm,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );

  const renderPeriodRow = (title: string, focusedMs: number, sessionCount: number, isLast: boolean) => (
    <View
      style={[
        styles.periodRow,
        isLast ? undefined : { borderBottomColor: colors.border, borderBottomWidth: 1 },
      ]}
      accessibilityLabel={`${title}: ${formatDurationShort(focusedMs)} focused, ${sessionCount} sessions`}
    >
      <Text
        style={[
          styles.periodTitle,
          {
            color: colors.primaryText,
            fontFamily: resolveTypeface(fontFamily, '500'),
            fontSize: typography.fontSizes.md,
          },
        ]}
      >
        {title}
      </Text>
      <View style={styles.periodValues}>
        <Text
          style={[
            styles.periodValue,
            {
              color: colors.primaryText,
              fontFamily: resolveTypeface(fontFamily, '600'),
              fontSize: typography.fontSizes.md,
            },
          ]}
        >
          {formatDurationShort(focusedMs)}
        </Text>
        <Text
          style={[
            styles.periodSessions,
            {
              color: colors.secondaryText,
              fontFamily: resolveTypeface(fontFamily, '400'),
              fontSize: typography.fontSizes.sm,
            },
          ]}
        >
          {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
        </Text>
      </View>
    </View>
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
      {/* Header (SettingsScreen/HistoryScreen pattern: back / title / spacer) */}
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
          Analytics
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      {!viewModel.hasData ? (
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
            No focus data yet
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
            Complete a focus session and your analytics will appear here.
          </Text>
          <PressableScale
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
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
              Go back
            </Text>
          </PressableScale>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Overview: today + streaks (History summary-card pattern) */}
          <View
            style={[
              styles.overviewCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityLabel="Overview"
          >
            <View style={styles.overviewRow}>
              {renderStat({
                value: formatDurationShort(viewModel.today.focusedMs),
                label: 'Focused today',
              })}
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              {renderStat({
                value: String(viewModel.today.sessionCount),
                label: 'Sessions today',
              })}
            </View>
            <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
            <View style={styles.overviewRow}>
              {renderStat({
                value: String(viewModel.currentStreak),
                label: 'Current streak',
              })}
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              {renderStat({
                value: String(viewModel.longestStreak),
                label: 'Longest streak',
              })}
            </View>
          </View>

          {/* Daily Focus Goal (P6) */}
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(fontFamily, '600'),
                fontSize: typography.fontSizes.sm,
              },
            ]}
          >
            DAILY GOAL
          </Text>
          <View
            style={[
              styles.goalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityLabel="Daily focus goal progress"
          >
            <View style={[styles.goalHeader, { borderBottomColor: colors.border }]}>
              <Text
                style={[
                  styles.goalLabel,
                  {
                    color: colors.primaryText,
                    fontFamily: resolveTypeface(fontFamily, '600'),
                    fontSize: typography.fontSizes.lg,
                  },
                ]}
              >
                {formatDurationShort(viewModel.dailyGoal.focusedMs)} / {formatDurationShort(viewModel.dailyGoal.goalMs)}
              </Text>
              <Text
                style={[
                  styles.goalStatus,
                  {
                    color: viewModel.dailyGoal.isCompleted
                      ? themeColors.status.success
                      : colors.secondaryText,
                    fontFamily: resolveTypeface(fontFamily, '500'),
                    fontSize: typography.fontSizes.sm,
                  },
                ]}
              >
                {viewModel.dailyGoal.isCompleted
                  ? 'Goal completed'
                  : `${formatDurationShort(viewModel.dailyGoal.remainingMs)} remaining`}
              </Text>
            </View>
            <View style={styles.goalProgressContainer}>
              <View style={[styles.goalProgressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.goalProgressBar,
                    {
                      width: `${viewModel.dailyGoal.progressCapped * 100}%`,
                      backgroundColor: viewModel.dailyGoal.isCompleted
                        ? themeColors.status.success
                        : accentColor,
                    },
                  ]}
                />
              </View>
              <View style={styles.goalProgressLabels}>
                <Text
                  style={[
                    styles.goalProgressLabel,
                    { color: colors.secondaryText, fontFamily: resolveTypeface(fontFamily, '400') },
                  ]}
                >
                  0
                </Text>
                <Text
                  style={[
                    styles.goalProgressLabel,
                    { color: colors.secondaryText, fontFamily: resolveTypeface(fontFamily, '400') },
                  ]}
                >
                  {formatDurationShort(viewModel.dailyGoal.goalMs)}
                </Text>
              </View>
            </View>
          </View>

          {/* Period summaries: Today / This week / This month */}
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(fontFamily, '600'),
                fontSize: typography.fontSizes.sm,
              },
            ]}
          >
            PERIODS
          </Text>
          <View
            style={[
              styles.periodCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {renderPeriodRow('Today', viewModel.today.focusedMs, viewModel.today.sessionCount, false)}
            {renderPeriodRow('This week', viewModel.week.focusedMs, viewModel.week.sessionCount, false)}
            {renderPeriodRow('This month', viewModel.month.focusedMs, viewModel.month.sessionCount, true)}
          </View>

          {/* Weekly Focus Bars (P5) */}
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(fontFamily, '600'),
                fontSize: typography.fontSizes.sm,
              },
            ]}
          >
            THIS WEEK
          </Text>
          <View
            style={[
              styles.chartCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.weekChart}>
              {weeklyChartData.map((day) => (
                <View
                  key={day.index}
                  style={[
                    styles.weekDayColumn,
                    { backgroundColor: colors.surface },
                  ]}
                  accessibilityLabel={`${day.label}: ${formatFocusedShort(day.focusedMs)} focused, ${day.sessionCount} ${day.sessionCount === 1 ? 'session' : 'sessions'}`}
                  accessibilityRole="button"
                >
                  <View
                    style={[
                      styles.weekBar,
                      {
                        height: Math.max(2, (day.intensity / INTENSITY_LEVELS) * 120),
                        backgroundColor: day.isToday ? accentColor : colors.primaryText,
                        opacity: day.intensity > 0 ? 0.3 + (day.intensity / INTENSITY_LEVELS) * 0.7 : 0,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.weekDayLabel,
                      {
                        color: day.isToday ? accentColor : colors.primaryText,
                        fontFamily: resolveTypeface(fontFamily, day.isToday ? '600' : '400'),
                        fontSize: typography.fontSizes.xs,
                      },
                    ]}
                  >
                    {day.label}
                  </Text>
                  <Text
                    style={[
                      styles.weekDayValue,
                      {
                        color: colors.secondaryText,
                        fontFamily: resolveTypeface(fontFamily, '400'),
                        fontSize: 10,
                      },
                    ]}
                  >
                    {day.focusedMs > 0 ? formatFocusedShort(day.focusedMs) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Monthly Calendar (P5) */}
          <Text
            style={[
              styles.sectionTitle,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(fontFamily, '600'),
                fontSize: typography.fontSizes.sm,
              },
            ]}
          >
            THIS MONTH
          </Text>
          <View
            style={[
              styles.chartCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[styles.monthHeader, { borderBottomColor: colors.border }]}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                <Text
                  key={i}
                  style={[
                    styles.monthDayHeader,
                    {
                      width: calendarCellSize,
                      color: colors.secondaryText,
                      fontFamily: resolveTypeface(fontFamily, '500'),
                      fontSize: typography.fontSizes.xs,
                    },
                  ]}
                >
                  {d}
                </Text>
              ))}
            </View>
            <View style={styles.monthGrid}>
              {monthlyChartData.map((day) => (
                <PressableScale
                  key={`${day.date.getFullYear()}-${day.date.getMonth()}-${day.day}`}
                  onPress={() => {}}
                  accessibilityLabel={`${day.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: ${formatFocusedShort(day.focusedMs)} focused, ${day.sessionCount} ${day.sessionCount === 1 ? 'session' : 'sessions'}`}
                  accessibilityRole="button"
                  style={[
                    styles.monthCell,
                    {
                      width: calendarCellSize,
                      height: calendarCellSize,
                      backgroundColor: day.inCurrentMonth ? colors.surface : 'transparent',
                      borderColor: day.inCurrentMonth ? colors.border : 'transparent',
                    },
                  ]}
                  disabled={!day.inCurrentMonth}
                >
                  <Text
                    style={[
                      styles.monthDayNumber,
                      {
                        color: day.inCurrentMonth
                          ? day.isToday
                            ? accentColor
                            : colors.primaryText
                          : colors.secondaryText,
                        fontFamily: resolveTypeface(fontFamily, day.isToday ? '600' : '400'),
                        fontSize: typography.fontSizes.sm,
                      },
                    ]}
                  >
                    {day.day}
                  </Text>
                  {day.intensity > 0 && (
                    <View
                      style={[
                        styles.monthIntensityDot,
                        {
                          backgroundColor: day.isToday ? accentColor : colors.primaryText,
                          opacity: 0.3 + (day.intensity / INTENSITY_LEVELS) * 0.7,
                          width: 6 + day.intensity * 2,
                          height: 6 + day.intensity * 2,
                        },
                      ]}
                    />
                  )}
                </PressableScale>
              ))}
            </View>
          </View>

          {/* History-cap transparency (500 retained records) */}
          <Text
            style={[
              styles.footnote,
              {
                color: colors.secondaryText,
                fontFamily: resolveTypeface(fontFamily, '400'),
                fontSize: typography.fontSizes.xs,
              },
            ]}
          >
            Based on your available session history
          </Text>
        </ScrollView>
      )}
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
  backButton: {
    fontWeight: typography.fontWeights.medium,
  },
  title: {
    fontWeight: typography.fontWeights.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  overviewCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontWeight: typography.fontWeights.bold,
  },
  statLabel: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sectionTitle: {
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  periodCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  periodTitle: {
    fontWeight: typography.fontWeights.medium,
  },
  periodValues: {
    alignItems: 'flex-end',
  },
  periodValue: {
    fontWeight: typography.fontWeights.semibold,
  },
  periodSessions: {
    marginTop: 2,
  },
  footnote: {
    textAlign: 'center',
    marginTop: spacing.sm,
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
  chartCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  weekChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    minHeight: 140,
  },
  weekDayColumn: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  weekBar: {
    width: 24,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
    alignSelf: 'center',
  },
  weekDayLabel: {
    marginBottom: spacing.xs,
  },
  weekDayValue: {
    fontSize: typography.fontSizes.xs,
  },
  monthHeader: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
  },
  monthDayHeader: {
    textAlign: 'center',
    // Same per-cell margin as monthCell so header pitch (width + margins)
    // matches the date cells exactly and every label stays centered over its
    // column.
    margin: 1,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.sm,
  },
  monthCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    margin: 1,
  },
  monthDayNumber: {
    fontWeight: typography.fontWeights.medium,
  },
  monthIntensityDot: {
    marginTop: spacing.xs,
    borderRadius: borderRadius.full,
  },
  goalCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  goalLabel: {
    flex: 1,
  },
  goalStatus: {
    marginLeft: spacing.md,
  },
  goalProgressContainer: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  goalProgressTrack: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  goalProgressBar: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  goalProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  goalProgressLabel: {
    fontSize: typography.fontSizes.xs,
  },
});
