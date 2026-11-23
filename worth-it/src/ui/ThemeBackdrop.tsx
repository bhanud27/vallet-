import React, { createContext, useContext, useRef } from "react";
import { BlurTargetView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "./theme";
const Backdrop = createContext<
  React.RefObject<React.ComponentRef<typeof View> | null> | undefined
>(undefined);
export const useThemeBackdrop = () => useContext(Backdrop);

/** Android captures only this decorative backdrop, never its own blur views/videos. */
export function ThemeBackdrop({ children }: { children: React.ReactNode }) {
  const target = useRef<React.ComponentRef<typeof View> | null>(null);
  const { glass, glossy, reducedEffects, mode, colors } = useTheme();
  const useAndroidTarget =
    Platform.OS === "android" &&
    (glass || (!!glossy && !reducedEffects && Number(Platform.Version) >= 31));
  const background = (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.bg, overflow: "hidden" },
      ]}
    >
      {glass ? (
        <>
          <View
            style={{
              position: "absolute",
              width: 460,
              height: 460,
              borderRadius: 230,
              top: -280,
              right: -180,
              backgroundColor: mode === "dark" ? "#101010" : "#FAFAFA",
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 400,
              height: 650,
              borderRadius: 200,
              bottom: -430,
              left: -240,
              backgroundColor: mode === "dark" ? "#090909" : "#F7F7F7",
            }}
          />
        </>
      ) : null}
    </View>
  );
  return (
    <Backdrop.Provider value={useAndroidTarget ? target : undefined}>
      {useAndroidTarget ? (
        <BlurTargetView
          ref={target}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          {background}
        </BlurTargetView>
      ) : (
        background
      )}
      {children}
    </Backdrop.Provider>
  );
}
