import React, { useRef, useState } from "react";
import { Image, Text } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import { reportProblem } from "../../lib/support";
import type { PickedPhoto } from "../../lib/types";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { Banner, Button } from "../kit";
import { SettingsField as Field } from "./SettingsField";
export function ReportSettings() {
  const { session } = useApp(),
    { type } = useTheme();
  const [text, setText] = useState(""),
    [photo, setPhoto] = useState<PickedPhoto>(),
    [id, setId] = useState(randomUUID),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const attempted = useRef(false);
  function payloadChanged() {
    if (attempted.current) {
      setId(randomUUID());
      attempted.current = false;
    }
  }
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
      <Text style={type.body}>
        Describe what happened and how to reproduce it. Reports and screenshots
        are private to you and authorized moderators. Avoid passwords, payment
        details and personal information.
      </Text>
      <Field
        label="Describe the problem"
        multiline
        maxLength={900}
        value={text}
        editable={!busy}
        onChangeText={(value) => {
          payloadChanged();
          setText(value);
        }}
      />
      {photo ? (
        <>
          <Image
            source={{ uri: photo.uri }}
            accessibilityLabel="Selected support screenshot"
            style={{ height: 220, width: "100%" }}
            resizeMode="contain"
          />
          <Button
            label="Remove screenshot"
            variant="quiet"
            disabled={busy}
            onPress={() => {
              payloadChanged();
              setPhoto(undefined);
            }}
          />
        </>
      ) : (
        <Button
          label="Add screenshot (optional)"
          variant="secondary"
          disabled={busy}
          onPress={async () => {
            try {
              const picked = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: false,
                quality: 1,
              });
              if (!picked.canceled) {
                const asset = picked.assets[0];
                if ((asset.fileSize ?? 0) > 15 * 1024 * 1024)
                  throw new Error("Choose a screenshot up to 15 MB.");
                payloadChanged();
                setPhoto({
                  uri: asset.uri,
                  mimeType: asset.mimeType,
                  width: asset.width,
                  height: asset.height,
                });
              }
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not select screenshot.",
              );
            }
          }}
        />
      )}
      <Button
        label="Submit problem report"
        disabled={text.trim().length < 5}
        loading={busy}
        onPress={async () => {
          attempted.current = true;
          setBusy(true);
          setError("");
          setNote("");
          try {
            const result = await reportProblem(session.userId, text, photo, id);
            attempted.current = false;
            setText("");
            setPhoto(undefined);
            setId(randomUUID());
            setNote(
              result.local
                ? "Demo report saved on this device. It has not been sent to support; screenshot files are not stored in demo reports."
                : "Problem report submitted for moderator review.",
            );
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not submit the report. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
