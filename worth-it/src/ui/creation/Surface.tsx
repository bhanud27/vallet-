import React from "react";
import { type ViewProps } from "react-native";
import { Screen } from "../kit";
import { ThemeSurface } from "../ThemeSurface";
import { useTheme } from "../theme";

export function CreationScreen({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
export function CreationSurface({
  frost = true,
  ...props
}: ViewProps & { frost?: boolean }) {
  const { appearance } = useTheme();
  return (
    <ThemeSurface
      {...props}
      frost={frost}
      testID={props.testID ?? "creation-surface-" + appearance}
    />
  );
}
