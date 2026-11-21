import React from "react";
/** React Native Web uses a CSS sticky wrapper instead of StickyHeaderComponent. */
export function ProfileStickyStyles({
  id,
  offset,
}: {
  id: string;
  offset: number;
}) {
  return offset > 0 ? (
    <style>{`#${id} > div > div:nth-child(2) { top: ${offset}px !important; }`}</style>
  ) : null;
}
