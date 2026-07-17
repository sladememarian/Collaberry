/**
 * Tracks the OS "reduce motion" accessibility setting. Components use it to
 * drop decorative animation (shimmer sweeps, breathing loops) for users who
 * ask for a calmer UI — a WCAG-friendly default. Live-updates if the user
 * toggles the setting while the app is open.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
