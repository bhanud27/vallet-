import React from "react";
import { Text, View } from "react-native";
import { type ProductFields, productFieldLimits } from "../lib/productDetails";
import { Field } from "./kit";
import { useTheme } from "./theme";
export function ProductDetailsFields({
  value,
  onChange,
  disabled = false,
  showAskingHint = true,
}: {
  value: ProductFields;
  onChange: (field: keyof ProductFields, value: string) => void;
  disabled?: boolean;
  showAskingHint?: boolean;
}) {
  const { type } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <Text style={type.h2}>Product information (optional)</Text>
      <Text style={type.small}>
        Check store details before publishing. You can edit or clear every
        field.
      </Text>
      {(
        [
          { key: "brand", label: "Brand", placeholder: "Enter the brand" },
          {
            key: "category",
            label: "Store category",
            placeholder: "For example, T-shirts",
          },
          {
            key: "description",
            label: "Product description",
            placeholder: "Add the available product details",
          },
          {
            key: "currency",
            label: "Store currency",
            placeholder: "For example, INR",
          },
          {
            key: "price",
            label: "Store price",
            placeholder: "Original price in the store currency",
          },
        ] as const
      ).map((field) => (
        <Field
          key={field.key}
          testID={"product-" + field.key}
          label={field.label}
          value={value[field.key]}
          onChangeText={(next) =>
            onChange(
              field.key,
              field.key === "currency" ? next.toUpperCase() : next,
            )
          }
          maxLength={productFieldLimits[field.key]}
          placeholder={field.placeholder}
          multiline={field.key === "description"}
          inputMode={field.key === "price" ? "decimal" : "text"}
          editable={!disabled}
        />
      ))}
      {showAskingHint && (
        <Text style={type.small}>
          The asking price for the poll stays in INR. Foreign store prices are
          never converted automatically.
        </Text>
      )}
    </View>
  );
}
