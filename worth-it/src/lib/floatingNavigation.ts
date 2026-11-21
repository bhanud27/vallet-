export const FLOATING_NAV = {
  edge: 12,
  gap: 8,
  barHeight: 70,
  maxWidth: 600,
  headerHeight: 54,
} as const;
/** Clearance for the overlay capsule and system gesture area in scroll content. */
export function floatingDockHeight(bottomInset: number) {
  return (
    FLOATING_NAV.barHeight + FLOATING_NAV.gap * 2 + Math.max(0, bottomInset)
  );
}

/** Overlay docks own their side safe areas; already-inset containers can opt out. */
export function floatingSidePadding(inset: number, applyInset: boolean) {
  return FLOATING_NAV.edge + (applyInset ? Math.max(0, inset) : 0);
}
