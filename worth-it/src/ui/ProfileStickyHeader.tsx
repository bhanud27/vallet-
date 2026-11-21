import React, {
  createContext,
  useContext,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Animated, type ScrollViewProps, type ViewProps } from "react-native";

type StickyProps = React.ComponentProps<
  NonNullable<ScrollViewProps["StickyHeaderComponent"]>
>;
type StickyHandle = { setNextHeaderY: (value: number) => void };
export const ProfileHeaderOffset = createContext(0);
/** Profile has one sticky controls row. Dock it below the floating header, not behind it. */
export const ProfileStickyHeader = forwardRef<StickyHandle, StickyProps>(
  function ProfileStickyHeader(
    { children, onLayout, scrollAnimatedValue, nativeID },
    ref,
  ) {
    const offset = useContext(ProfileHeaderOffset);
    const [layoutY, setLayoutY] = useState<number | null>(null);
    // ScrollView uses this handle for collisions between multiple sticky rows; this list has one.
    useImperativeHandle(ref, () => ({ setNextHeaderY: () => {} }), []);
    const translateY = useMemo(() => {
      const threshold = Math.max(0, (layoutY ?? 0) - offset);
      return scrollAnimatedValue.interpolate({
        inputRange: [threshold, threshold + 1],
        outputRange: [0, 1],
        extrapolateLeft: "clamp",
      });
    }, [scrollAnimatedValue, layoutY, offset]);
    const child = React.Children.only(
      children,
    ) as React.ReactElement<ViewProps>;
    return (
      <Animated.View
        collapsable={false}
        nativeID={nativeID}
        onLayout={(event) => {
          setLayoutY(event.nativeEvent.layout.y);
          onLayout(event);
          child.props.onLayout?.(event);
        }}
        style={[
          child.props.style,
          {
            zIndex: 10,
            transform: [{ translateY: layoutY === null ? 0 : translateY }],
          },
        ]}
      >
        {React.cloneElement(child, { style: { flex: 1 }, onLayout: undefined })}
      </Animated.View>
    );
  },
);
