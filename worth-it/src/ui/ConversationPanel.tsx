import React, { type ReactNode, useMemo, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlossyReflection } from "./ThemeSurface";
import { themedStyles, useTheme } from "./theme";

export function ConversationPanel({
  children,
  onClose,
  testID = "comments-panel",
  label = "comments",
}: {
  children: ReactNode;
  onClose: () => void;
  testID?: string;
  label?: string;
}) {
  const styles = useStyles();
  const { glossy, reducedEffects } = useTheme();

  const { width } = useWindowDimensions();
  const side = width >= 900;
  return (
    <Modal
      visible
      transparent
      animationType={
        glossy && reducedEffects ? "none" : side ? "fade" : "slide"
      }
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.overlay, side && styles.sideOverlay]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={"Dismiss " + label}
          onPress={onClose}
        />
        <PanelSurface
          side={side}
          onClose={onClose}
          testID={testID}
          label={label}
        >
          {children}
        </PanelSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function PanelSurface({
  children,
  side,
  onClose,
  testID,
  label,
}: {
  children: ReactNode;
  side: boolean;
  onClose: () => void;
  testID: string;
  label: string;
}) {
  const styles = useStyles();

  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const translation = useState(() => new Animated.Value(0))[0];
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !side &&
          Math.abs(gesture.dy) > 8 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) =>
          translation.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 110 || (gesture.dy > 30 && gesture.vy > 0.8)) {
            onClose();
            return;
          }
          if (gesture.dy < -50) setExpanded(true);
          Animated.spring(translation, {
            toValue: 0,
            useNativeDriver: Platform.OS !== "web",
            bounciness: 0,
          }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(translation, {
            toValue: 0,
            useNativeDriver: Platform.OS !== "web",
            bounciness: 0,
          }).start(),
      }),
    [onClose, side, translation],
  );
  return (
    <Animated.View
      testID={testID}
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      style={[
        styles.surface,
        {
          height: expanded ? "92%" : "74%",
          paddingBottom: Math.max(insets.bottom, 8),
          transform: [{ translateY: translation }],
        },
        side && styles.side,
        side && { paddingTop: insets.top },
      ]}
    >
      <GlossyReflection strong />
      {!side && (
        <View
          {...pan.panHandlers}
          style={[
            styles.dragArea,
            Platform.OS === "web" && ({ touchAction: "none" } as ViewStyle),
          ]}
        >
          <Pressable
            accessibilityRole="button"
            testID="comment-sheet-handle"
            accessibilityLabel={(expanded ? "Collapse " : "Expand ") + label}
            onPress={() => setExpanded((value) => !value)}
            style={styles.gripButton}
          >
            <View style={styles.grip} />
          </Pressable>
        </View>
      )}
      {children}
    </Animated.View>
  );
}
const useStyles = themedStyles(({ colors, glossy }) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: glossy?.scrim ?? "#0007",
    },
    sideOverlay: {
      alignItems: "flex-end",
      justifyContent: "center",
      backgroundColor: glossy?.scrim ?? "#0003",
    },
    surface: {
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
      backgroundColor: glossy?.elevated ?? colors.surface,
      borderTopWidth: glossy ? 1 : 0,
      borderColor: glossy?.emphasizedBorder ?? colors.border,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      overflow: "hidden",
    },
    side: {
      width: 400,
      maxWidth: 400,
      height: "100%",
      alignSelf: "flex-end",
      borderRadius: 0,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderLeftWidth: 1,
      borderColor: colors.border,
    },
    dragArea: { height: 24, alignItems: "center", justifyContent: "center" },
    gripButton: {
      width: "100%",
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    grip: {
      width: 36,
      height: 4,
      borderRadius: 3,
      backgroundColor: colors.grip,
    },
  }),
);
