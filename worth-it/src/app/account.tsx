import { ThemeSurface } from "../ui/ThemeSurface";
import React, { useEffect, useState } from "react";
import { useApp } from "../ui/AppContext";
import { supabase } from "../lib/supabase";
import { optionalRpc } from "../lib/backendRpc";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { settingsGroups } from "../lib/settingsCatalog";
import { repo } from "../lib/repo";
import { SocialIcon } from "../ui/SocialIcon";
import { Screen, Button } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function Account() {
  const { colors, type } = useTheme();
  const { session } = useApp();
  const [moderator, setModerator] = useState(false);
  useEffect(() => {
    let active = true;
    if (supabase)
      void optionalRpc<boolean>(supabase, "is_worthit_moderator")
        .then((r) => {
          if (active) setModerator(r.available && !!r.data);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session.userId]);
  return (
    <Screen>
      <Text style={type.title}>Settings</Text>
      <Text style={type.small}>Your account, your style, your choices.</Text>
      {supabase ? (
        session.needsPassword ? (
          <Button
            label="Finish setting up your account"
            onPress={() => router.push("/signup")}
          />
        ) : session.isGuest ? (
          <>
            <Button
              label="Create account"
              onPress={() => router.push("/signup")}
            />
            <Button
              label="Sign in"
              variant="secondary"
              onPress={() => router.push("/login")}
            />
          </>
        ) : (
          <Text style={type.small}>Signed in as {session.email}</Text>
        )
      ) : null}
      {moderator ? (
        <Button
          label="Moderation"
          variant="secondary"
          onPress={() => router.push("/moderation")}
        />
      ) : null}
      {settingsGroups.map((group) => (
        <View key={group.title} style={{ gap: 8 }}>
          <Text
            style={[
              type.small,
              { fontWeight: "800", paddingHorizontal: 4, marginTop: 8 },
            ]}
          >
            {group.title}
          </Text>
          <ThemeSurface
            testID="settings-group-surface"
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              overflow: "hidden",
            }}
          >
            {group.items.map((item, index) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() =>
                  router.push(
                    item.key === "archive"
                      ? "/archive"
                      : {
                          pathname: "/settings/[section]",
                          params: { section: item.key },
                        },
                  )
                }
                style={({ pressed }) => ({
                  minHeight: 62,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  gap: 13,
                  alignItems: "center",
                  borderTopWidth: index ? 1 : 0,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.accentSoft : "transparent",
                })}
              >
                <SocialIcon
                  name={item.icon}
                  color={item.key === "delete" ? colors.danger : colors.muted}
                />
                <Text
                  style={[
                    type.body,
                    {
                      flex: 1,
                      fontSize: 15,
                      color: item.key === "delete" ? colors.danger : colors.ink,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                <SocialIcon name="arrow" color={colors.muted} />
              </Pressable>
            ))}
          </ThemeSurface>
        </View>
      ))}
      {repo.mode === "local" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Demo tools"
          onPress={() =>
            router.push({
              pathname: "/settings/[section]",
              params: { section: "demo" },
            })
          }
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={type.small}>Demo tools</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
