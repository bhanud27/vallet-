import React from "react";
import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { useTheme } from "../ui/theme";
import { SocialIcon } from "../ui/SocialIcon";
import {
  CreationScreen as Screen,
  CreationSurface,
} from "../ui/creation/Surface";
import { DEMO_IMAGES } from "../ui/demoImages";
export default function Add() {
  const { type, colors } = useTheme();
  return (
    <Screen>
      <Text style={type.title}>Make it yours.</Text>
      <Text style={type.body}>
        A fashion find, a second opinion, or your next look.
      </Text>
      {(
        [
          {
            title: "Poll",
            description: "Get opinions or compare products.",
            icon: "feed",
            image: "sneaker-1",
            path: "/new",
          },
          {
            title: "Post",
            description: "Share your style and fashion finds.",
            icon: "photo",
            image: "oxford-shirt",
            path: "/new-post",
          },
        ] as const
      ).map((option) => (
        <CreationSurface key={option.title}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={option.title}
            onPress={() => router.push(option.path)}
            style={{
              minHeight: 180,
              padding: 22,
              flexDirection: "row",
              alignItems: "center",
              gap: 18,
            }}
          >
            <View style={{ flex: 1, gap: 12 }}>
              <SocialIcon name={option.icon} color={colors.accentInk} />
              <Text style={type.title}>{option.title}</Text>
              <Text style={type.small}>{option.description}</Text>
            </View>
            <Image
              source={DEMO_IMAGES[option.image]}
              style={{ width: 105, height: 130, borderRadius: 16 }}
              resizeMode="cover"
              accessibilityElementsHidden
            />
            <SocialIcon name="arrow" color={colors.muted} />
          </Pressable>
        </CreationSurface>
      ))}
    </Screen>
  );
}
