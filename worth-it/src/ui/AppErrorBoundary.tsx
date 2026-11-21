import React from "react";
import { Text, View } from "react-native";
import { recordMetric } from "../lib/diagnostics";
import { Button } from "./kit";
import { useTheme } from "./theme";
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    recordMetric("crash", false, 0);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorFallback onRetry={() => this.setState({ failed: false })} />;
  }
}
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { colors, type } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 24,
        gap: 16,
        backgroundColor: colors.bg,
      }}
    >
      <Text style={type.title}>Something went wrong</Text>
      <Text style={type.body}>
        Your saved posts are safe. Try opening this screen again.
      </Text>
      <Button label="Try again" onPress={onRetry} />
    </View>
  );
}
