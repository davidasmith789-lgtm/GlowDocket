const LOW_MOTION_CLASS = "adaptive-low-motion";
const SAMPLE_WINDOW_MS = 750;
const LOW_FPS_THRESHOLD = 44;
const BAD_WINDOWS_TO_ENABLE = 2;

export function startAdaptiveMotionMonitor() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let animationFrameId = 0;
  let windowStartedAt = 0;
  let previousFrameAt = 0;
  let frameCount = 0;
  let slowFrameCount = 0;
  let badWindows = 0;

  const resetWindow = (timestamp = 0) => {
    windowStartedAt = timestamp;
    previousFrameAt = timestamp;
    frameCount = 0;
    slowFrameCount = 0;
  };

  const sample = (timestamp) => {
    if (document.hidden) {
      resetWindow(timestamp);
      animationFrameId = window.requestAnimationFrame(sample);
      return;
    }
    if (!windowStartedAt) resetWindow(timestamp);
    const frameDuration = timestamp - previousFrameAt;
    previousFrameAt = timestamp;
    frameCount += 1;
    if (frameDuration > 25) slowFrameCount += 1;

    const elapsed = timestamp - windowStartedAt;
    if (elapsed >= SAMPLE_WINDOW_MS) {
      const fps = frameCount * 1000 / elapsed;
      const slowFrameRatio = slowFrameCount / Math.max(1, frameCount);
      const struggling = fps < LOW_FPS_THRESHOLD || slowFrameRatio > 0.22;

      badWindows = struggling ? badWindows + 1 : 0;
      if (badWindows >= BAD_WINDOWS_TO_ENABLE) {
        // Keep this decision for the page session. Repeatedly restoring motion
        // made CSS animations appear to stop and restart at random.
        document.documentElement.classList.add(LOW_MOTION_CLASS);
        animationFrameId = 0;
        return;
      }
      resetWindow(timestamp);
    }
    animationFrameId = window.requestAnimationFrame(sample);
  };

  const handleVisibilityChange = () => resetWindow(performance.now());
  document.addEventListener("visibilitychange", handleVisibilityChange);
  animationFrameId = window.requestAnimationFrame(sample);
  return () => {
    window.cancelAnimationFrame(animationFrameId);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.documentElement.classList.remove(LOW_MOTION_CLASS);
  };
}
