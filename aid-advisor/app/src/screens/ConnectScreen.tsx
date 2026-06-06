import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AppConfig } from '../config';
import type { GlucoseUnit } from '../core';
import { colors } from '../theme';

interface Props {
  initial: AppConfig;
  onSubmit: (config: AppConfig) => void;
}

/** Connection form: where to read from, how to authenticate, and the review
 *  window. Kept deliberately simple for testing on a real device. */
export function ConnectScreen({ initial, onSubmit }: Props) {
  const [url, setUrl] = useState(initial.url);
  const [token, setToken] = useState(initial.token);
  const [secret, setSecret] = useState(initial.secret);
  const [days, setDays] = useState(String(initial.days));
  const [unit, setUnit] = useState<GlucoseUnit>(initial.unit);

  const dayNum = Number(days);
  const canSubmit =
    url.trim().length > 0 &&
    (token.trim().length > 0 || secret.trim().length > 0) &&
    Number.isFinite(dayNum) &&
    dayNum > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>AID Advisor</Text>
        <Text style={styles.sub}>
          Connect to your Nightscout site to review patterns in your data.
        </Text>

        <Field label="Nightscout URL">
          <TextInput
            style={styles.input}
            placeholder="https://my-site.example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={url}
            onChangeText={setUrl}
          />
        </Field>

        <Field label="Access token (recommended)">
          <TextInput
            style={styles.input}
            placeholder="ro-xxxxxxxxxxxx"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={token}
            onChangeText={setToken}
          />
        </Field>

        <Field label="…or API secret">
          <TextInput
            style={styles.input}
            placeholder="hashed on-device, never sent in plain text"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={secret}
            onChangeText={setSecret}
          />
        </Field>

        <View style={styles.row}>
          <Field label="Days to review" style={styles.halfLeft}>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={days}
              onChangeText={setDays}
            />
          </Field>
          <Field label="Units" style={styles.halfRight}>
            <View style={styles.toggle}>
              <UnitButton label="mg/dL" active={unit === 'mg/dl'} onPress={() => setUnit('mg/dl')} />
              <UnitButton label="mmol/L" active={unit === 'mmol'} onPress={() => setUnit('mmol')} />
            </View>
          </Field>
        </View>

        <Pressable
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({ url: url.trim(), token, secret, days: dayNum, unit })
          }
        >
          <Text style={styles.ctaText}>Review my data</Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          This app describes patterns it observes in your data. It is not medical
          advice and does not recommend therapy changes. Discuss any changes to
          insulin, settings, or an automated system with your healthcare team.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function UnitButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.unitBtn, active && styles.unitBtnActive]} onPress={onPress}>
      <Text style={[styles.unitText, active && styles.unitTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 8 },
  h1: { color: colors.text, fontSize: 28, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 4, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { color: colors.textMuted, fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  row: { flexDirection: 'row' },
  halfLeft: { flex: 1, marginRight: 8 },
  halfRight: { flex: 1, marginLeft: 8 },
  toggle: { flexDirection: 'row' },
  unitBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  unitBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  unitText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  unitTextActive: { color: colors.accentText },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: colors.accentText, fontSize: 16, fontWeight: '700' },
  disclaimer: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 20,
    fontStyle: 'italic',
  },
});
