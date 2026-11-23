import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SocialIcon, type SocialIconName } from "./SocialIcon";
import { FloatingSurface } from "./FloatingSurface";
import { useTheme } from "./theme";
import {
  FLOATING_NAV,
  floatingDockHeight,
  floatingSidePadding,
} from "../lib/floatingNavigation";

type MainTab = "feed" | "search" | "reels" | "profile";
type TabPath = (typeof items)[number]["path"];
type Tab = {
  key: MainTab | "add";
  icon: SocialIconName;
  label: string;
  path: "/" | "/search" | "/add" | "/reels" | "/profile" | "/notifications";
};
const items: Tab[] = [
  { key: "feed", icon: "home", label: "Feed", path: "/" },
  { key: "search", icon: "search", label: "Spot", path: "/search" },
  { key: "add", icon: "add", label: "Add", path: "/add" },
  { key: "reels", icon: "checks", label: "Checks", path: "/reels" },
  { key: "profile", icon: "person", label: "Profile", path: "/profile" },
];
const creationItems: Tab[] = [
  { key: "feed", icon: "home", label: "Home", path: "/" },
  { key: "search", icon: "search", label: "Explore", path: "/search" },
  { key: "add", icon: "plus", label: "Create", path: "/add" },
  { key: "reels", icon: "heart", label: "Activity", path: "/notifications" },
  { key: "profile", icon: "person", label: "Profile", path: "/profile" },
];
function TabItem({
  item,
  selected,
  creation,
  onNavigate,
}: {
  item: (typeof items)[number];
  selected: boolean;
  creation: boolean;
  onNavigate?: (path: TabPath) => void;
}) {
  const { reducedEffects, colors, glossy, creation: tokens } = useTheme();
  const [opacity] = useState(
    () => new Animated.Value(reducedEffects && selected ? 1 : 0),
  );
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: selected ? 1 : 0,
      duration: reducedEffects ? 0 : 140,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [selected, reducedEffects, opacity]);
  const center = creation && item.key === "add";
  const color = selected
    ? colors.accentInk
    : glossy
      ? glossy.icon
      : creation
        ? tokens.secondary
        : colors.muted;
  return (
    <Pressable
      testID={item.key === "add" ? "new-poll" : "nav-" + item.key}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      aria-pressed={selected}
      onPress={() =>
        onNavigate
          ? onNavigate(item.path)
          : item.key === "add"
            ? router.push(item.path)
            : router.navigate(item.path)
      }
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 58,
        minWidth: 44,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        borderRadius: 24,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      {center ? (
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: colors.tag,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SocialIcon
            name="plus"
            color={glossy ? colors.tagInk : colors.onAccent}
            size={24}
          />
        </View>
      ) : (
        <>
          <View
            style={{
              width: 36,
              height: 30,
              borderRadius: 12,
              backgroundColor:
                glossy && item.key === "add" ? glossy.elevated : undefined,
              borderWidth: glossy && item.key === "add" ? 1 : 0,
              borderColor: glossy?.emphasizedBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 36,
                height: 30,
                borderRadius: 12,
                backgroundColor: colors.accentSoft,
                opacity,
              }}
            />
            <SocialIcon
              name={item.icon}
              color={glossy && item.key === "add" ? colors.ink : color}
              size={26}
            />
          </View>
          <Text
            style={{
              fontSize: 11,
              lineHeight: 14,
              fontWeight: selected ? "700" : "500",
              color,
            }}
          >
            {item.label}
          </Text>
        </>
      )}
      {!center && selected ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 3,
            width: 14,
            height: 2,
            borderRadius: 1,
            backgroundColor: colors.accent,
          }}
        />
      ) : null}
    </Pressable>
  );
}
export function AppTabs({
  active,
  safeAreaSides = true,
  creation = false,
  onNavigate,
}: {
  active: MainTab | "add";
  creation?: boolean;
  onNavigate?: (path: TabPath) => void;
  safeAreaSides?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="floating-nav-dock"
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        backgroundColor: "transparent",
        height: floatingDockHeight(insets.bottom),
        flexShrink: 0,
        paddingTop: FLOATING_NAV.gap,
        paddingBottom: insets.bottom + FLOATING_NAV.gap,
        paddingLeft:
          floatingSidePadding(insets.left, safeAreaSides) + (creation ? 4 : 0),
        paddingRight:
          floatingSidePadding(insets.right, safeAreaSides) + (creation ? 4 : 0),
      }}
    >
      <FloatingSurface
        radius={40}
        creation={creation}
        testID="navigation-surface"
        containerStyle={{
          width: "100%",
          maxWidth: creation ? 480 : FLOATING_NAV.maxWidth,
          alignSelf: "center",
        }}
        style={{
          height: FLOATING_NAV.barHeight,
          paddingHorizontal: 8,
          paddingVertical: 5,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {(creation ? creationItems : items).map((item) => (
          <TabItem
            key={item.key}
            item={item}
            selected={item.key === active}
            creation={creation}
            onNavigate={onNavigate}
          />
        ))}
      </FloatingSurface>
    </View>
  );
}
