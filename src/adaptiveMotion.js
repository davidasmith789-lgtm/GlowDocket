const LOW_MOTION_CLASS = "adaptive-low-motion";
const VISIBLE_STUTTER_MS = 120;
const SUSPENDED_FRAME_GAP_MS = 1000;

export function startAdaptiveMotionMonitor() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let animationFrameId = 0;
  let previousFrameAt = 0;

  const resetSample = (timestamp = 0) => {
    previousFrameAt = timestamp;
  };

  const sample = (timestamp) => {
    if (document.hidden) {
      resetSample(timestamp);
      animationFrameId = window.requestAnimationFrame(sample);
      return;
    }
    if (!previousFrameAt) {
      resetSample(timestamp);
      animationFrameId = window.requestAnimationFrame(sample);
      return;
    }
    const frameDuration = timestamp - previousFrameAt;
    previousFrameAt = timestamp;
    if (frameDuration >= VISIBLE_STUTTER_MS && frameDuration < SUSPENDED_FRAME_GAP_MS) {
      // A single pause this long is visibly frozen. Keep motion off for the
      // page session instead of repeatedly stopping and restarting it.
      document.documentElement.classList.add(LOW_MOTION_CLASS);
      animationFrameId = 0;
      return;
    }
    animationFrameId = window.requestAnimationFrame(sample);
  };

  const handleVisibilityChange = () => resetSample(performance.now());
  document.addEventListener("visibilitychange", handleVisibilityChange);
  animationFrameId = window.requestAnimationFrame(sample);
  return () => {
    window.cancelAnimationFrame(animationFrameId);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.documentElement.classList.remove(LOW_MOTION_CLASS);
  };
}
