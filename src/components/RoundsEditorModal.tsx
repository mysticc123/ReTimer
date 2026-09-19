import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WheelNumberPicker } from './WheelNumberPicker';
import { EditorModalShell } from './EditorModalShell';

export const ROUNDS_MIN = 2;
export const ROUNDS_MAX = 12;

interface RoundsEditorModalProps {
  visible: boolean;
  initialRounds: number;
  onSave: (rounds: number) => void;
  onCancel: () => void;
}

/**
 * Integer rounds editor reusing the shared wheel selector.
 * The wheel range enforces validity, so the draft is always saveable.
 * Rounds never pass through duration conversion.
 */
export const RoundsEditorModal: React.FC<RoundsEditorModalProps> = ({
  visible,
  initialRounds,
  onSave,
  onCancel,
}) => {
  const [rounds, setRounds] = useState(initialRounds);

  // Pre-fill the draft from the stored value every time the editor opens.
  useEffect(() => {
    if (visible) {
      setRounds(Math.max(ROUNDS_MIN, Math.min(ROUNDS_MAX, initialRounds)));
    }
  }, [visible, initialRounds]);

  return (
    <EditorModalShell
      visible={visible}
      title="Rounds"
      error={null}
      saveDisabled={false}
      onSave={() => onSave(rounds)}
      onCancel={onCancel}
    >
      <View
        key={visible ? `open-${initialRounds}` : 'closed'}
        style={styles.wheelWrap}
      >
        <WheelNumberPicker
          label="Rounds"
          value={rounds}
          min={ROUNDS_MIN}
          max={ROUNDS_MAX}
          onChange={setRounds}
          formatValue={(value) => String(value)}
        />
      </View>
    </EditorModalShell>
  );
};

const styles = StyleSheet.create({
  wheelWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
