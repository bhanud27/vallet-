import React, { useState } from "react";
import { Text, View } from "react-native";
import { useApp } from "../ui/AppContext";
import { sendFeedback } from "../lib/engagement";
import { Screen, Banner, Button, Field } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function Feedback() {
  const { type } = useTheme();

  const { session } = useApp();
  const [rating, setRating] = useState(4),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  return (
    <Screen>
      <Text style={type.title}>Help improve Worth It</Text>
      <Text style={type.body}>
        Feedback is shared privately with moderators. How useful was your
        purchase decision? Avoid passwords, payment details, or other sensitive
        information.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            label={String(n) + (n === rating ? " selected" : "")}
            variant={n === rating ? "primary" : "secondary"}
            onPress={() => setRating(n)}
          />
        ))}
      </View>
      <Field
        label="What helped, or what went wrong?"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={1000}
      />
      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
      <Button
        label="Send feedback"
        loading={busy}
        disabled={!message.trim() || busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await sendFeedback(session.userId, rating, message);
            setMessage("");
            setNote("Feedback saved. Thank you.");
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not send feedback.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </Screen>
  );
}
