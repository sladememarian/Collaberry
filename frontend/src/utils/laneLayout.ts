/**
 * Fit-lane layout math shared by DraggableBoard + KanbanBoard.
 *
 * Desktop / wide tablets: every lane + the "Add lane" control must fit in the
 * viewport. When a new lane is added, every lane narrows so nothing spills off
 * the right edge.
 *
 * Phones: keep a comfortable card width and allow horizontal scrolling — cramming
 * 5 lanes into 360px makes cards unreadable.
 */

export const LANE_GUTTER = 14;
export const BOARD_PAD = 16;
/** Ghost "Add lane" control — kept narrow so it doesn't steal space from cards. */
export const ADD_LANE_WIDTH = 72;
export const ADD_LANE_GAP = 14;

export function computeLaneWidth(screenW: number, laneCount: number): number {
  const n = Math.max(laneCount, 1);
  const available = Math.max(screenW - BOARD_PAD * 2, 200);
  const isPhone = screenW < 700;

  if (isPhone) {
    // ~82% of the screen so the next lane peeks in as a scroll affordance.
    return Math.min(320, Math.max(240, available * 0.82));
  }

  // Desktop / tablet: reserve room for the Add-lane control + gutters between
  // every lane, then split the rest evenly. No hard floor that forces overflow.
  const gutters = LANE_GUTTER * Math.max(n - 1, 0) + ADD_LANE_GAP + ADD_LANE_WIDTH;
  const fit = (available - gutters) / n;

  // Soft bounds so 1–2 lanes don't stretch absurdly, and dense boards stay
  // usable. If the soft min can't fit, we still honour fit (shrink further).
  const softMin = screenW >= 1100 ? 180 : 150;
  const softMax = 360;

  if (fit >= softMin) return Math.min(fit, softMax);
  // Overflow would happen if we enforced softMin — shrink instead.
  return Math.max(120, fit);
}

export function computeAddLaneWidth(laneWidth: number, screenW: number): number {
  if (screenW < 700) return Math.min(140, Math.max(96, laneWidth * 0.55));
  return ADD_LANE_WIDTH;
}
