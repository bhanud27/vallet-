import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput } from "react-native";
import { Field } from "../kit";
import { useTheme } from "../theme";

// Editing is explicit; existing parent save/verification actions still persist values.
export function SettingsField(props: React.ComponentProps<typeof Field>) {
  const { colors } = useTheme();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [editing, setEditing] = useState(false);
  const enabled = props.editable !== false;
  if (!enabled && editing) setEditing(false);
  useEffect(() => {
    if (editing && enabled) input.current?.focus();
    else input.current?.blur();
  }, [editing, enabled]);
  return (
    <Field
      {...props}
      inputRef={input}
      editable={enabled && editing}
      trailingAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            (editing ? "Done editing " : "Edit ") + props.label
          }
          disabled={!enabled}
          onPress={() => setEditing((value) => !value)}
          style={({ pressed }) => ({
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: !enabled ? 0.4 : pressed ? 0.65 : 1,
          })}
        >
          <Text
            style={{ color: colors.accentInk, fontSize: 12, fontWeight: "700" }}
          >
            {editing ? "Done" : "Edit"}
          </Text>
        </Pressable>
      }
    />
  );
}
