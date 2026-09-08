/**
 * Frame scheduling that survives a hidden tab.
 *
 * Browsers throttle - and in some cases entirely pause - requestAnimationFrame
 * for pages that are not visible. Start-up work must not depend on that, or a
 * page opened in a background tab never finishes loading.
 */

/** Resolve on the next animation frame, or shortly after if frames are paused. */
export function nextFrame(timeoutMs = 40): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(() => done());
    setTimeout(done, timeoutMs);
  });
}

/** Schedule a callback for the next frame, falling back to a timer. */
export function scheduleFrame(callback: () => void, timeoutMs = 40): void {
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    callback();
  };
  requestAnimationFrame(run);
  setTimeout(run, timeoutMs);
}
