import { Link } from "expo-router";
import React from "react";
import { Text } from "react-native";
import { Centered } from "../ui/kit";
import { useTheme } from "../ui/theme";

export default function NotFound() {
  const { type } = useTheme();

  return (
    <Centered>
      <Text style={type.h2}>This link doesn’t open a poll</Text>
      <Text style={type.small}>Check that the whole link was copied.</Text>
      <Link
        href="/"
        style={{
          fontSize: 16,
          fontWeight: "800",
          textDecorationLine: "underline",
        }}
      >
        Go to Worth It?
      </Link>
    </Centered>
  );
}
