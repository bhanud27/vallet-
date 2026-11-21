import React from "react";
import { StarButton } from "./StarButton";
import { useContentStar } from "./useContentStar";
import type { StarState } from "../lib/starState";
export function ContentStarButton({
  kind,
  id,
  initial,
  dark,
  disabled,
  post,
}: {
  kind: "poll" | "reel";
  id: string;
  initial?: StarState;
  dark?: boolean;
  disabled?: boolean;
  post?: boolean;
}) {
  const star = useContentStar(kind, id, initial);
  return (
    <StarButton
      subject={post ? "post" : kind}
      starred={star.value.starred}
      count={star.value.count}
      onToggle={star.set}
      dark={dark}
      disabled={disabled}
    />
  );
}
