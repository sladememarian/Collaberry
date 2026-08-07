/**
 * A one-way channel from a screen up to the app shell.
 *
 * The nav rail lives in the layout, but "search" only means something on the
 * board screen, which owns the item list. Rather than the rail reaching down
 * into a screen it doesn't know about, screens register a handler on mount and
 * clear it on unmount; the rail renders the entry only while one exists.
 *
 * Registration must be paired with cleanup, or the rail keeps offering search
 * after you leave the board and calls a handler that closes over a dead screen.
 * `useScreenSearch` below does the pairing so callers can't forget.
 */
import React, { createContext, useContext, useEffect } from "react";

interface ScreenActions {
  registerSearch: (fn: (() => void) | null) => void;
}

export const ScreenActionsContext = createContext<ScreenActions>({
  registerSearch: () => {},
});

/**
 * Publish this screen's search handler to the nav rail for as long as the
 * screen is mounted.
 *
 * Pass a stable (useCallback'd) `open` — an inline closure re-registers on every
 * render, which is harmless but pointless churn.
 */
export function useScreenSearch(open: (() => void) | null) {
  const { registerSearch } = useContext(ScreenActionsContext);

  useEffect(() => {
    registerSearch(open);
    return () => registerSearch(null);
  }, [open, registerSearch]);
}
