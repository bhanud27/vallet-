import React, { ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Image,
  ImageStyle,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  Switch,
  SwitchProps,
  View,
  ViewStyle,
} from "react-native";
import { Poll } from "../lib/types";
import { formatProductPrice } from "../lib/productPrice";
import { DEMO_IMAGES } from "./demoImages";
import { GlossyReflection } from "./ThemeSurface";
import { themedStyles, useTheme } from "./theme";

export function Screen({
  children,
  onRefresh,
  refreshing,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { colors } = useTheme();
  const s = useKitStyles();
  const { pageBackground } = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: pageBackground }}
      contentContainerStyle={s.screenContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
    >
      <View style={s.column}>{children}</View>
    </ScrollView>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};
export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  testID,
}: BtnProps) {
  const { colors, glossy } = useTheme();
  const s = useKitStyles();

  const off = disabled || loading;
  const bg =
    variant === "primary"
      ? colors.accent
      : variant === "secondary"
        ? colors.surface
        : "transparent";
  const fg =
    glossy && disabled && !loading
      ? colors.muted
      : variant === "primary"
        ? colors.onAccent
        : colors.ink;
  return (
    <Pressable
      testID={testID}
      disabled={!!off}
      aria-disabled={!!off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        {
          backgroundColor:
            glossy && disabled && !loading && variant !== "quiet"
              ? glossy.elevated
              : bg,
          opacity: off && !glossy ? 0.5 : pressed ? 0.85 : 1,
        },
        variant === "secondary" && {
          borderWidth: 1,
          borderColor: colors.border,
        },
        glossy && { overflow: "hidden" },
        glossy &&
          disabled &&
          !loading &&
          variant !== "quiet" && {
            borderWidth: 1,
            borderColor: glossy.disabled,
          },
        style,
      ]}
    >
      {glossy && variant !== "quiet" ? <GlossyReflection /> : null}
      {loading ? <ActivityIndicator color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Banner({
  kind,
  children,
  testID,
}: {
  kind: "info" | "warn" | "error" | "ok" | "demo";
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  const s = useKitStyles();

  const map = {
    info: [colors.infoBg, colors.infoInk],
    warn: [colors.warnBg, colors.warnInk],
    error: [colors.dangerBg, colors.danger],
    ok: [colors.okBg, colors.okInk],
    demo: [colors.warnBg, colors.warnInk],
  } as const;
  const [bg, fg] = map[kind];
  return (
    <View
      testID={testID}
      accessibilityRole={kind === "error" ? "alert" : undefined}
      style={[s.banner, { backgroundColor: bg }]}
    >
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>
        {children}
      </Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  labelAction,
  trailingAction,
  inputRef,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string;
  labelAction?: ReactNode;
  trailingAction?: ReactNode;
  inputRef?: React.Ref<React.ComponentRef<typeof TextInput>>;
} & TextInputProps) {
  const { colors, type, mode } = useTheme();
  const s = useKitStyles();

  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {labelAction ? (
        <View style={s.fieldHeading}>
          <Text style={s.label}>{label}</Text>
          {labelAction}
        </View>
      ) : (
        <Text style={s.label}>{label}</Text>
      )}
      <View style={{ position: "relative" }}>
        <TextInput
          ref={inputRef}
          {...input}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.accent}
          keyboardAppearance={mode}
          onFocus={(e) => {
            setFocus(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            input.onBlur?.(e);
          }}
          style={[
            s.input,
            !!trailingAction && { paddingRight: 54 },
            focus && { borderColor: colors.accent },
            !!error && { borderColor: colors.danger },
            input.multiline && { minHeight: 84, textAlignVertical: "top" },
          ]}
        />
        {trailingAction ? (
          <View
            style={{
              position: "absolute",
              right: 3,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            {trailingAction}
          </View>
        ) : null}
      </View>
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
      ) : hint ? (
        <Text style={type.small}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Badge({
  label,
  tone = "demo",
}: {
  label: string;
  tone?: "demo" | "ok" | "muted" | "info";
}) {
  const { colors } = useTheme();
  const s = useKitStyles();

  const map = {
    demo: [colors.strong, colors.onStrong],
    ok: [colors.okBg, colors.okInk],
    muted: [colors.media, colors.muted],
    info: [colors.infoBg, colors.infoInk],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );
}

/** Price tag with a punched hole. */
export function PriceTag({
  price,
  label = "Asking",
  currency = "INR",
  size = "large",
}: {
  price: number;
  label?: string;
  currency?: string | null;
  size?: "large" | "small" | "inline";
}) {
  const { colors } = useTheme();
  const s = useKitStyles();

  const big = size === "large";
  const inline = size === "inline";
  return (
    <View
      style={[
        s.tag,
        big
          ? { paddingVertical: 8, paddingLeft: 30, paddingRight: 16 }
          : {
              paddingVertical: inline ? 3 : 4,
              paddingLeft: inline ? 18 : 22,
              paddingRight: inline ? 8 : 10,
            },
      ]}
      accessible
      accessibilityLabel={`${label} price ${formatProductPrice(price, currency)}`}
    >
      <View
        style={[
          s.hole,
          big
            ? { left: 11, top: "50%", marginTop: -5 }
            : { left: 8, top: "50%", marginTop: -4, width: 8, height: 8 },
        ]}
      />
      {!inline ? (
        <Text
          style={{
            fontSize: big ? 11 : 10,
            color: colors.tagInk,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
      ) : null}
      <Text
        style={{
          fontSize: big ? 28 : inline ? 15 : 17,
          lineHeight: inline ? 18 : undefined,
          fontWeight: "900",
          color: colors.tagInk,
          fontVariant: ["tabular-nums"],
          letterSpacing: -0.5,
        }}
      >
        {inline && !currency
          ? price.toLocaleString("en-IN", { maximumFractionDigits: 2 })
          : formatProductPrice(price, currency)}
      </Text>
    </View>
  );
}

export function PollImage({
  poll,
  style,
  fit = "cover",
}: {
  poll: Pick<Poll, "demoImage" | "imageUrl" | "itemName">;
  style: StyleProp<ImageStyle>;
  fit?: "cover" | "contain";
}) {
  const { type } = useTheme();
  const s = useKitStyles();

  const [failed, setFailed] = useState(false);
  const src = poll.demoImage
    ? DEMO_IMAGES[poll.demoImage]
    : poll.imageUrl
      ? { uri: poll.imageUrl }
      : null;
  if (!src || failed) {
    return (
      <View style={[style as StyleProp<ViewStyle>, s.imgFallback]}>
        <Text style={type.small}>Photo unavailable</Text>
      </View>
    );
  }
  return (
    <Image
      source={src}
      style={style}
      resizeMode={fit}
      accessibilityLabel={`Photo of ${poll.itemName}`}
      onError={() => setFailed(true)}
    />
  );
}

export function Centered({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 14,
      }}
    >
      {children}
    </View>
  );
}

const useKitStyles = themedStyles(({ colors, glossy }) =>
  StyleSheet.create({
    screenContent: { padding: 16, paddingBottom: 48, alignItems: "center" },
    column: { width: "100%", maxWidth: 560, gap: 16 },
    btn: {
      minHeight: 48,
      borderRadius: 13,
      paddingHorizontal: 16,
      paddingVertical: 11,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10,
    },
    btnText: { fontSize: 15, fontWeight: "700" },
    banner: { borderRadius: 12, padding: 12 },
    label: { fontSize: 15, fontWeight: "700", color: colors.ink },
    fieldHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    input: {
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: glossy?.secondary ?? colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 17,
      color: colors.ink,
      ...(Platform.OS === "web" ? { outlineColor: colors.accent } : {}),
      minHeight: 50,
    },
    badge: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    tag: {
      backgroundColor: colors.tag,
      maxWidth: "100%",
      borderRadius: 10,
      alignSelf: "flex-start",
      justifyContent: "center",
    },
    hole: {
      position: "absolute",
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.bg,
    },
    imgFallback: {
      backgroundColor: colors.media,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);

export function ThemedSwitch(props: SwitchProps) {
  const { colors } = useTheme();
  return (
    <Switch
      {...(Platform.OS === "web" ? { activeThumbColor: colors.onAccent } : {})}
      trackColor={{ false: colors.border, true: colors.accent }}
      thumbColor={props.value ? colors.onAccent : colors.surface}
      ios_backgroundColor={colors.border}
      {...props}
    />
  );
}
