/** Coordinates can be nested in touches on native move/release events. */
type TouchPoint = { pageX?: number; pageY?: number };
export function contentTouchPoint(
  event: TouchPoint & {
    touches?: readonly TouchPoint[];
    changedTouches?: readonly TouchPoint[];
  },
): { x: number; y: number } | undefined {
  for (const point of [event.touches?.[0], event.changedTouches?.[0], event]) {
    if (point && Number.isFinite(point.pageX) && Number.isFinite(point.pageY))
      return { x: point.pageX!, y: point.pageY! };
  }
}

/** A second press reserves the first tap until release; scrolling/long press cancels. */
export function contentTaps(
  single: () => void,
  double: () => void,
  delay = 350,
  clock: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (id: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
) {
  let timer: unknown, point: { x: number; y: number } | undefined;
  let secondPress = false;
  const nearby = (x: number, y: number) =>
    point && Math.hypot(x - point.x, y - point.y) <= 40;
  const cancel = () => {
    if (timer !== undefined) clock.clear(timer);
    timer = undefined;
    point = undefined;
    secondPress = false;
  };
  return {
    cancel,
    begin(x = 0, y = 0) {
      if (timer !== undefined && nearby(x, y)) {
        clock.clear(timer);
        timer = undefined;
        secondPress = true;
      } else if (point) cancel();
    },
    tap(x = 0, y = 0) {
      if ((secondPress || timer !== undefined) && nearby(x, y)) {
        cancel();
        double();
        return;
      }
      cancel();
      point = { x, y };
      timer = clock.set(() => {
        timer = undefined;
        point = undefined;
        single();
      }, delay);
    },
  };
}
