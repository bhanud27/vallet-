import React from "react";
import { Screen } from "../ui/kit";
import { ActivitySettings } from "../ui/settings/ActivitySettings";
export default function Saved() {
  return (
    <Screen>
      <ActivitySettings section="saved" />
    </Screen>
  );
}
