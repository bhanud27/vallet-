import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/** One accessibility subscription for the app, rather than one per feed card. */
export function useReducedEffects() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    if (Platform.OS === "web") {
      const transparency = window.matchMedia(
        "(prefers-reduced-transparency: reduce)",
      );
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => {
        if (active) setReduced(transparency.matches || motion.matches);
      };
      update();
      transparency.addEventListener("change", update);
      motion.addEventListener("change", update);
      return () => {
        active = false;
        transparency.removeEventListener("change", update);
        motion.removeEventListener("change", update);
      };
    }
    let transparency = false,
      motion = false,
      revision = 0;
    const update = () => {
      revision++;
      if (active) setReduced(transparency || motion);
    };
    const a =
      Platform.OS === "ios"
        ? AccessibilityInfo.addEventListener(
            "reduceTransparencyChanged",
            (value) => {
              transparency = value;
              update();
            },
          )
        : undefined;
    const b = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        motion = value;
        update();
      },
    );
    const initialRevision = revision;
    void Promise.all([
      Platform.OS === "ios"
        ? AccessibilityInfo.isReduceTransparencyEnabled()
        : Promise.resolve(false),
      AccessibilityInfo.isReduceMotionEnabled(),
    ])
      .then(([t, m]) => {
        if (active && revision === initialRevision) {
          transparency = t;
          motion = m;
          update();
        }
      })
      .catch(() => {});
    return () => {
      active = false;
      a?.remove();
      b.remove();
    };
  }, []);
  return reduced;
}
