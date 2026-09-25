import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useTheme, resolveTypeface } from '../theme';
import { useSettingsStore } from '../store';
import { spacing, typography } from '../theme/colors';
import { formatTwoDigits } from '../utils/durationFormat';

interface WheelNumberPickerProps {
  /** Accessible name, e.g. "Minutes". */
  label: string;
  /** Currently selected value. Must satisfy min <= value <= max. */
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Display formatting. Defaults to two digits ("00"–"99"). */
  formatValue?: (value: number) => string;
  /** Fixed row height in px. Fixed heights are required for reliable snapping. */
  rowHeight?: number;
  /** Number of visible rows (forced odd so one row is exactly centered). */
  visibleRows?: number;
}

/**
 * Reusable numeric wheel selector.
 *
 * Native FlatList scrolling with `snapToInterval` + fast deceleration:
 * exactly one value settles in the center. Top/bottom padding lets the
 * first and last values reach the center. A static accent indicator marks
 * the selected row even during fast flings.
 *
 * The selected value is committed via `onChange` whenever the centered index
 * changes (scroll end, momentum end, or tap). No timers or JS animation loops.
 */
export const WheelNumberPicker: React.FC<WheelNumberPickerProps> = ({
  label,
  value,
  min,
  max,
  onChange,
  formatValue = formatTwoDigits,
  rowHeight = 48,
  visibleRows = 5,
}) => {
  const { colors, accentColor, fontFamily } = useTheme();
  const reduceMotion = useSettingsStore((state) => state.settings.reducedMotion);

  // Force an odd row count so exactly one row sits in the center.
  const oddRows = Math.max(3, visibleRows % 2 === 1 ? visibleRows : visibleRows + 1);
  const wheelHeight = rowHeight * oddRows;
  const edgePadding = (wheelHeight - rowHeight) / 2;

  const data = useMemo(() => {
    const items: number[] = [];
    for (let v = min; v <= max; v++) items.push(v);
    return items;
  }, [min, max]);

  const listRef = useRef<FlatList<number> | null>(null);
  // Last index already reported via onChange (avoids duplicate commits).
  const lastSentIndex = useRef<number>(value - min);

  const selectedFontSize = Math.min(24, rowHeight - 14);
  const normalFontSize = Math.min(17, rowHeight - 20);

  const commitIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(data.length - 1, index));
    if (clamped !== lastSentIndex.current) {
      lastSentIndex.current = clamped;
      onChange(min + clamped);
    }
  };

  const indexFromOffset = (offsetY: number): number =>
    Math.round(offsetY / rowHeight);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitIndex(indexFromOffset(event.nativeEvent.contentOffset.y));
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitIndex(indexFromOffset(event.nativeEvent.contentOffset.y));
  };

  const handleSelect = (item: number, index: number) => {
    lastSentIndex.current = index;
    onChange(item);
    listRef.current?.scrollToIndex({ index, animated: !reduceMotion });
  };

  return (
    <View
      style={[styles.container, { height: wheelHeight, minWidth: 88 }]}
      accessibilityLabel={`${label} picker, ${formatValue(value)} selected`}
    >
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => String(item)}
        renderItem={({ item, index }) => {
          const selected = item === value;
          return (
            <Pressable
              onPress={() => handleSelect(item, index)}
              accessibilityLabel={`${label} ${formatValue(item)}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.row, { height: rowHeight }]}
            >
              <Text
                style={[
                  selected ? styles.selectedText : styles.normalText,
                  {
                    color: selected ? colors.primaryText : colors.secondaryText,
                    fontSize: selected ? selectedFontSize : normalFontSize,
                    fontFamily: resolveTypeface(fontFamily, selected ? '700' : '400'),
                  },
                ]}
              >
                {formatValue(item)}
              </Text>
            </Pressable>
          );
        }}
        getItemLayout={(_, index) => ({
          length: rowHeight,
          offset: rowHeight * index,
          index,
        })}
        initialScrollIndex={Math.max(0, Math.min(data.length - 1, value - min))}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({
            offset: info.index * rowHeight,
            animated: false,
          });
        }}
        contentContainerStyle={{
          paddingTop: edgePadding,
          paddingBottom: edgePadding,
        }}
        snapToInterval={rowHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        showsVerticalScrollIndicator={false}
      />
      {/* Static center indicator: clear during fast flings, never blocks touch. */}
      <View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            top: edgePadding,
            height: rowHeight,
            borderTopColor: accentColor,
            borderBottomColor: accentColor,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  selectedText: {
    fontWeight: typography.fontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
  normalText: {
    fontWeight: typography.fontWeights.regular,
    fontVariant: ['tabular-nums'],
  },
  indicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
  },
});
