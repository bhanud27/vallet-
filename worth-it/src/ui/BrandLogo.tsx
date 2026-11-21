import React from "react";
import { Image } from "expo-image";

const source = require("../../assets/brand-logo.png");

export function BrandLogo({ size = 34 }: { size?: number }) {
  return (
    <Image
      testID="brand-logo"
      source={source}
      contentFit="contain"
      accessible={false}
      style={{ width: size, height: size, borderRadius: size * 0.25 }}
    />
  );
}
