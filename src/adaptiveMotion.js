const LOW_MOTION_CLASS = "adaptive-low-motion";
const SAMPLE_WINDOW_MS = 750;
const LOW_FPS_THRESHOLD = 44;
const RECOVERY_FPS_THRESHOLD = 54;
const BAD_WINDOWS_TO_ENABLE = 2;
const GOOD_WINDOWS_TO_DISABLE = 4;

export function startAdaptiveMotionMonitor() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let animationFrameId = 0;
  let windowStartedAt = 0;
  let previousFrameAt = 0;
  let frameCount = 0;
  let slowFrameCount = 0;
  let badWindows = 0;
  let goodWindows = 0;

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
      const lowMotionActive = document.documentElement.classList.contains(LOW_MOTION_CLASS);
      const struggling = fps < LOW_FPS_THRESHOLD || slowFrameRatio > 0.22;
      const healthy = fps >= RECOVERY_FPS_THRESHOLD && slowFrameRatio < 0.08;

      badWindows = struggling ? badWindows + 1 : 0;
      goodWindows = healthy ? goodWindows + 1 : 0;
      if (!lowMotionActive && badWindows >= BAD_WINDOWS_TO_ENABLE) {
        document.documentElement.classList.add(LOW_MOTION_CLASS);
        badWindows = 0;
        goodWindows = 0;
      } else if (lowMotionActive && goodWindows >= GOOD_WINDOWS_TO_DISABLE) {
        document.documentElement.classList.remove(LOW_MOTION_CLASS);
        badWindows = 0;
        goodWindows = 0;
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
