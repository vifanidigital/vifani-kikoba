import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function TopTabs<T extends string>({ tabs, selected, onSelect }: {
  tabs: readonly { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.row}>
      {tabs.map(({ id, label }) => {
        const active = id === selected;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(id)}
            testID={'top-tab-' + id}
            style={active ? [styles.tab, styles.active] : styles.tab}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: '#115e59', padding: 4, gap: 4, borderRadius: 12, marginTop: 12 },
  tab: { flexGrow: 1, flexBasis: 0, minHeight: 48, justifyContent: 'center', paddingHorizontal: 4, borderRadius: 8 },
  active: { backgroundColor: '#fff' },
  label: { color: '#ccfbf1', textAlign: 'center', fontWeight: '700', fontSize: 11 },
  activeLabel: { color: '#115e59' },
});
