import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NightscoutClient, buildReport } from './src/core';
import type { FindingsReport } from './src/core';
import {
  buildAuth,
  deviceTzOffsetMinutes,
  loadConfig,
  saveConfig,
  type AppConfig,
} from './src/config';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { ReportScreen } from './src/screens/ReportScreen';
import { colors } from './src/theme';

type Phase =
  | { kind: 'booting' }
  | { kind: 'connect' }
  | { kind: 'loading' }
  | { kind: 'report'; report: FindingsReport }
  | { kind: 'error'; message: string };

const DAY_MS = 86_400_000;

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'booting' });
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      setPhase({ kind: 'connect' });
    });
  }, []);

  async function runReview(cfg: AppConfig, isRefresh = false) {
    setConfig(cfg);
    await saveConfig(cfg);
    if (!isRefresh) setPhase({ kind: 'loading' });
    try {
      const auth = await buildAuth(cfg);
      const client = new NightscoutClient({ baseUrl: cfg.url, auth });
      const endMs = Date.now();
      const dataset = await client.fetchDataset({
        startMs: endMs - cfg.days * DAY_MS,
        endMs,
        tzOffsetMinutes: deviceTzOffsetMinutes(),
        displayUnit: cfg.unit,
      });
      const report = buildReport(dataset);
      setPhase({ kind: 'report', report });
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {phase.kind === 'booting' && <Centered>Loading…</Centered>}

      {phase.kind === 'connect' && config && (
        <ConnectScreen initial={config} onSubmit={(cfg) => runReview(cfg)} />
      )}

      {phase.kind === 'loading' && (
        <Centered>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Reading your Nightscout data…</Text>
        </Centered>
      )}

      {phase.kind === 'report' && config && (
        <ReportScreen
          report={phase.report}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            runReview(config, true);
          }}
          onEdit={() => setPhase({ kind: 'connect' })}
        />
      )}

      {phase.kind === 'error' && (
        <Centered>
          <Text style={styles.errorTitle}>Couldn’t complete the review</Text>
          <Text style={styles.errorBody}>{phase.message}</Text>
          <Pressable style={styles.button} onPress={() => setPhase({ kind: 'connect' })}>
            <Text style={styles.buttonText}>Back to settings</Text>
          </Pressable>
        </Centered>
      )}
    </SafeAreaView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.centered}>
      {typeof children === 'string' ? <Text style={styles.loadingText}>{children}</Text> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: colors.textMuted, fontSize: 14, marginTop: 12, textAlign: 'center' },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorBody: { color: colors.textMuted, fontSize: 13, marginTop: 10, textAlign: 'center' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 20,
  },
  buttonText: { color: colors.accentText, fontWeight: '700' },
});
