import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export const colors = {
  forest: "#103C35",
  blue: "#075CF5",
  mint: "#C7F5B5",
  green: "#006F53",
  ink: "#143B34",
  muted: "#5C716A",
  background: "#F8F9F5",
  border: "#DAE3DA",
  controlBorder: "#718A78",
  white: "#FFFFFF",
  pale: "#E9F7EF",
  amber: "#9A5D00",
  amberPale: "#FFF1D8",
};

/** Decorative mark; pair with readable Onesa Mobile text. */
export function BrandMark({ light = false }: { light?: boolean }) {
  const backgroundColor = light ? colors.mint : colors.forest;
  return (
    <View
      style={styles.brandBars}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.brandBar, { height: 12, backgroundColor }]} />
      <View style={[styles.brandBar, { height: 21, backgroundColor }]} />
      <View style={[styles.brandBar, { height: 29, backgroundColor }]} />
    </View>
  );
}

export function Label({
  children,
  light = false,
}: {
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <Text style={[styles.eyebrow, light && styles.lightText]}>{children}</Text>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "neutral";
}) {
  return (
    <View
      style={[
        styles.tag,
        tone === "amber" && styles.amberTag,
        tone === "neutral" && { backgroundColor: colors.background },
      ]}
    >
      <Text
        style={[
          styles.tagText,
          tone === "amber" && styles.amberText,
          tone === "neutral" && { color: colors.muted },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

export function Card({
  children,
  tinted = false,
}: {
  children: ReactNode;
  tinted?: boolean;
}) {
  return (
    <View style={[styles.card, tinted && styles.tintedCard]}>{children}</View>
  );
}

export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text
        style={[styles.buttonText, secondary && styles.secondaryButtonText]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionHeading}>
      {children}
    </Text>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  frame: { width: "100%", maxWidth: 820, alignSelf: "center" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandBars: {
    width: 31,
    height: 31,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingLeft: 2,
    transform: [{ skewX: "-12deg" }],
  },
  brandBar: { width: 6, borderRadius: 2 },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.forest,
    letterSpacing: -0.8,
  },
  brandQualifier: { fontSize: 12, color: colors.muted, marginLeft: 1 },
  headerTag: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: colors.muted,
  },
  demoBanner: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pale,
  },
  demoText: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  hero: {
    backgroundColor: colors.forest,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    overflow: "hidden",
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -1.2,
    maxWidth: 460,
  },
  heroBody: { color: "#CBE3D8", fontSize: 14, lineHeight: 22, maxWidth: 510 },
  heroRule: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.mint,
  },
  screenTitle: {
    color: colors.forest,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  strongBody: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
  },
  small: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  eyebrow: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1.1,
    fontWeight: "800",
  },
  lightText: { color: colors.mint },
  sectionHeading: {
    color: colors.forest,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  tintedCard: { backgroundColor: colors.pale },
  cardHeading: {
    color: colors.forest,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "700",
  },
  cardTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tag: {
    backgroundColor: colors.pale,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  tagText: {
    color: colors.green,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: 0.35,
  },
  amberTag: { backgroundColor: colors.amberPale },
  amberText: { color: colors.amber },
  stack: { gap: 10 },
  fineStack: { gap: 5 },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 5,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    flexShrink: 1,
  },
  detailValue: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.blue,
    borderRadius: 8,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: colors.pale,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { color: colors.ink },
  pressed: { opacity: 0.9 },
  steps: { gap: 14 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNumber: {
    minWidth: 27,
    minHeight: 27,
    borderRadius: 14,
    backgroundColor: colors.pale,
    color: colors.green,
    textAlign: "center",
    paddingTop: 4,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "800",
  },
  stepContent: { flex: 1, gap: 3 },
  stepTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  planList: { gap: 12 },
  planName: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    color: colors.forest,
    letterSpacing: -0.6,
  },
  features: { gap: 8 },
  feature: { flexDirection: "row", gap: 8 },
  featureDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.green,
    marginTop: 8,
  },
  featureText: { flex: 1, fontSize: 14, lineHeight: 21, color: colors.ink },
  notice: {
    borderLeftWidth: 3,
    borderLeftColor: colors.mint,
    paddingLeft: 12,
    gap: 4,
  },
  selectedNotice: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.pale,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nav: {
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  navInner: { flexDirection: "row", paddingHorizontal: 8, paddingTop: 4 },
  navItem: {
    flex: 1,
    minHeight: 55,
    paddingHorizontal: 4,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  navIndicator: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  navIndicatorActive: { backgroundColor: colors.green },
  navText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  navTextActive: { color: colors.green, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  gridCell: { flexBasis: 240, flexGrow: 1, flexShrink: 1 },
});
