import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Finding, FindingsReport } from '../core';
import { FindingCard } from '../components/FindingCard';
import { colors, domainOrder, domainTitle } from '../theme';

interface Props {
  report: FindingsReport;
  refreshing: boolean;
  onRefresh: () => void;
  onEdit: () => void;
}

export function ReportScreen({ report, refreshing, onRefresh, onEdit }: Props) {
  const byDomain = new Map<Finding['domain'], Finding[]>();
  for (const f of report.findings) {
    const arr = byDomain.get(f.domain) ?? [];
    arr.push(f);
    byDomain.set(f.domain, arr);
  }

  const attention = report.findings.filter((f) => f.severity === 'attention').length;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <View style={styles.topRow}>
        <View style={styles.flexShrink}>
          <Text style={styles.h1}>Data review</Text>
          <Text style={styles.sub}>
            {report.daysAnalysed} day(s) · {report.findings.length} observations ·{' '}
            {attention} worth a look
          </Text>
        </View>
        <Pressable style={styles.editBtn} onPress={onEdit}>
          <Text style={styles.editText}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Informational summary of patterns in your data. Not medical advice; it
          does not recommend therapy changes. Discuss any changes with your
          healthcare team.
        </Text>
      </View>

      {domainOrder.map((domain) => {
        const items = byDomain.get(domain);
        if (!items || items.length === 0) return null;
        return (
          <View key={domain} style={styles.section}>
            <Text style={styles.sectionTitle}>{domainTitle[domain]}</Text>
            {items.map((f) => (
              <FindingCard key={f.id} finding={f} />
            ))}
          </View>
        );
      })}

      <Text style={styles.footer}>Pull down to refresh.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flexShrink: { flexShrink: 1, paddingRight: 12 },
  h1: { color: colors.text, fontSize: 26, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  editBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  banner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  bannerText: { color: colors.text, fontSize: 12, lineHeight: 17 },
  section: { marginTop: 18 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  footer: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16 },
});
