import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  defaultPreferences,
  getAccountPreferences,
  mutedAccounts,
  preferenceScore,
} from "./accountPreferences";
let account = defaultPreferences();
let muted: string[] = [];
export const autoplayEnabled = () => account.autoplay;
export const recommendationScore = (text: string) =>
  preferenceScore(account, text);
export const accountMuted = (id: string) => muted.includes(id);
type Listener = () => void;
const listeners = new Set<Listener>();
let lowData = false;
let samples = true;
let generation = 0;
export const isLowData = () => lowData;
export const samplesEnabled = () => samples;
const notify = () => listeners.forEach((listener) => listener());
export function subscribePreferences(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function loadPreferences(userId: string) {
  const request = ++generation;
  const [low, sample, settings, mutes] = await Promise.all([
    AsyncStorage.getItem("worthit:low-data:" + userId),
    AsyncStorage.getItem("worthit:samples:" + userId),
    getAccountPreferences(userId).catch(() => ({
      available: false,
      stored: false,
      value: defaultPreferences(),
    })),
    mutedAccounts(userId).catch(() => []),
  ]);
  if (request !== generation) return;
  account = settings.value;
  muted = mutes.map((row) => row.id);
  lowData = settings.stored ? account.data_saver : low === "true";
  samples = sample !== "false";
  notify();
}
export async function setLowData(userId: string, value: boolean) {
  await AsyncStorage.setItem("worthit:low-data:" + userId, String(value));
  lowData = value;
  notify();
}
export async function setSamplesEnabled(userId: string, value: boolean) {
  await AsyncStorage.setItem("worthit:samples:" + userId, String(value));
  samples = value;
  notify();
}

export function resetActivePreferences() {
  generation++;
  account = defaultPreferences();
  lowData = false;
  samples = true;
  muted = [];
  notify();
}
