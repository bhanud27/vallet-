import React from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router, type NativeStackHeaderProps } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingSurface } from "./FloatingSurface";
import { SocialIcon } from "./SocialIcon";
import { useTheme } from "./theme";
import { FLOATING_NAV } from "../lib/floatingNavigation";

export function FloatingHeader({
  title,
  leading,
  center,
  creation = false,
  trailing,
  testID = "floating-header",
  containerStyle,
  tone = "theme",
}: {
  title?: string;
  leading?: React.ReactNode;
  center?: React.ReactNode;
  creation?: boolean;
  trailing?: React.ReactNode;
  testID?: string;
  containerStyle?: StyleProp<ViewStyle>;
  tone?: "theme" | "dark";
}) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          backgroundColor: "transparent",
          width: "100%",
          paddingHorizontal: creation ? 16 : FLOATING_NAV.edge,
          paddingVertical: FLOATING_NAV.gap,
          flexShrink: 0,
        },
        containerStyle,
      ]}
    >
      <FloatingSurface
        radius={28}
        tone={tone}
        creation={creation}
        testID={testID}
        containerStyle={{
          backgroundColor: "transparent",
          width: "100%",
          maxWidth: creation ? 480 : FLOATING_NAV.maxWidth,
          alignSelf: "center",
        }}
        style={{
          minHeight: FLOATING_NAV.headerHeight,
          paddingHorizontal: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {leading}
        {center ? (
          <View pointerEvents="none" style={{ flex: 1, alignItems: "center" }}>
            {center}
          </View>
        ) : title ? (
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 18,
              lineHeight: 24,
              fontWeight: "800",
              color: tone === "dark" ? "#FFFFFF" : colors.ink,
            }}
          >
            {title}
          </Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {trailing ? (
          <View
            style={{
              flexShrink: 0,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            {trailing}
          </View>
        ) : null}
      </FloatingSurface>
    </View>
  );
}

/** Honor the existing Stack title/back/actions, without a second native header. */
export function FloatingStackHeader({
  navigation,
  route,
  options,
  back,
}: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets(),
    { colors } = useTheme();
  const canGoBack = !!back || navigation.canGoBack();
  const creation = ["add", "new", "new-post", "new-reel"].includes(route.name);
  const headerProps = {
    tintColor: colors.ink,
    canGoBack,
    label: back?.title,
    href: back?.href,
  };
  const leading = options.headerLeft ? (
    options.headerLeft(headerProps)
  ) : options.headerBackVisible !== false && (canGoBack || creation) ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => (canGoBack ? navigation.goBack() : router.replace("/"))}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ transform: [{ rotate: "180deg" }] }}>
        <SocialIcon name="arrow" />
      </View>
    </Pressable>
  ) : undefined;
  return (
    <View
      pointerEvents="box-none"
      style={{
        backgroundColor: "transparent",
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <FloatingHeader
        title={
          typeof options.headerTitle === "string"
            ? options.headerTitle
            : (options.title ?? route.name)
        }
        leading={leading}
        trailing={options.headerRight?.(headerProps)}
        testID="stack-floating-header"
      />
    </View>
  );
}
