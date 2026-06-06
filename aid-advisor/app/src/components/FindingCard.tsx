import { StyleSheet, Text, View } from 'react-native';
import type { Finding } from '../core';
import { colors, severityStyle } from '../theme';

/** Renders one finding: a coloured severity dot, the neutral observation
 *  title, the factual detail, and the auditable metrics behind it. */
export function FindingCard({ finding }: { finding: Finding }) {
  const sev = severityStyle[finding.severity];
  const metrics = Object.entries(finding.metrics).filter(
    ([k]) => k !== 'status',
  );
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: sev.dot }]} />
        <Text style={styles.title}>{finding.title}</Text>
      </View>
      <Text style={styles.detail}>{finding.detail}</Text>
      {metrics.length > 0 && (
        <View style={styles.metrics}>
          {metrics.map(([key, value]) => (
            <View key={key} style={styles.chip}>
              <Text style={styles.chipText}>
                {key}: {String(value)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 10 },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  detail: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { color: colors.text, fontSize: 11 },
});
