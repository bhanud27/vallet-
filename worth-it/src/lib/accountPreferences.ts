import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { optionalRpc, FeatureUnavailableError } from "./backendRpc";
import {
  defaultPreferences,
  validatePreferences,
  type AccountPreferences,
} from "./preferenceValues";
export async function getAccountPreferences(
  viewer: string,
): Promise<{
  available: boolean;
  value: AccountPreferences;
  stored?: boolean;
}> {
  const legacyDataSaver =
    (await AsyncStorage.getItem("worthit:low-data:" + viewer)) === "true";
  if (supabase) {
    const result = await optionalRpc<Partial<AccountPreferences>>(
      supabase,
      "worthit_settings",
      { p_patch: null },
    );
    return {
      stored:
        result.available &&
        !!result.data &&
        Object.keys(result.data).length > 0,
      available: result.available,
      value: {
        ...defaultPreferences(),
        data_saver: legacyDataSaver,
        ...(result.available ? result.data : {}),
      },
    };
  }
  const raw = await AsyncStorage.getItem("worthit:settings:" + viewer);
  return {
    stored: !!raw,
    available: true,
    value: {
      ...defaultPreferences(),
      data_saver: legacyDataSaver,
      ...(raw ? JSON.parse(raw) : {}),
    },
  };
}
let writes = Promise.resolve();
export function saveAccountPreferences(
  viewer: string,
  patch: Partial<AccountPreferences>,
) {
  validatePreferences(patch);
  const task = writes.then(async () => {
    if (supabase) {
      const current = await getAccountPreferences(viewer);
      const r = await optionalRpc<AccountPreferences>(
        supabase,
        "worthit_settings",
        {
          p_patch: {
            ...(!current.stored
              ? { data_saver: current.value.data_saver }
              : {}),
            ...patch,
          },
        },
      );
      if (!r.available)
        throw new FeatureUnavailableError(
          "Settings are awaiting the database update.",
        );
      return r.data;
    }
    const { value } = await getAccountPreferences(viewer);
    const next = {
      ...value,
      ...patch,
      notification_types: {
        ...value.notification_types,
        ...patch.notification_types,
      },
    };
    await AsyncStorage.setItem(
      "worthit:settings:" + viewer,
      JSON.stringify(next),
    );
    return next;
  });
  writes = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
export type MutedAccount = { id: string; username: string };
export async function mutedAccounts(
  viewer: string,
  change?: { id: string; muted: boolean },
): Promise<MutedAccount[]> {
  if (supabase) {
    const r = await optionalRpc<MutedAccount[]>(supabase, "worthit_muted", {
      p_id: change?.id ?? null,
      p_muted: change?.muted ?? null,
    });
    if (!r.available)
      throw new FeatureUnavailableError(
        "Mute controls are awaiting the database update.",
      );
    return r.data ?? [];
  }
  const key = "worthit:muted:" + viewer;
  let rows: MutedAccount[] = JSON.parse(
    (await AsyncStorage.getItem(key)) || "[]",
  );
  if (change) {
    rows = rows.filter((row) => row.id !== change.id);
    if (change.muted) rows.push({ id: change.id, username: change.id });
    await AsyncStorage.setItem(key, JSON.stringify(rows));
  }
  return rows;
}

export * from "./preferenceValues";
