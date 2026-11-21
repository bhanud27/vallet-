import React, { useState } from "react";
import { View, Text } from "react-native";
import { reportContent } from "../lib/safety";
import { Banner, Button, Field } from "./kit";
import { useTheme } from "./theme";
export function ReportButton({
  kind,
  id,
}: {
  kind: "poll" | "reel" | "account";
  id: string;
}) {
  const { type } = useTheme();

  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <View>
      {!open ? (
        <Button label="Report" variant="quiet" onPress={() => setOpen(true)} />
      ) : (
        <>
          <Text style={type.small}>
            Reports are reviewed by moderators. Describe the problem without
            sharing private information.
          </Text>
          <Field
            label="Reason for reporting"
            value={reason}
            onChangeText={setReason}
            maxLength={500}
            editable={!busy}
          />
          <Button
            label="Submit report"
            loading={busy}
            disabled={reason.trim().length < 5}
            onPress={async () => {
              setBusy(true);
              try {
                await reportContent(kind, id, reason);
                setOpen(false);
                setMessage("Report submitted for review.");
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Could not submit report.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            label="Cancel"
            variant="quiet"
            disabled={busy}
            onPress={() => setOpen(false)}
          />
        </>
      )}
      {message ? <Banner kind="info">{message}</Banner> : null}
    </View>
  );
}
