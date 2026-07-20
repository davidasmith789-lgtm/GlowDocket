import { useEffect, useRef } from "react";

const RIPPLE_COUNT = 7;
const RIPPLE_STAGGER_MS = 95;
const RIPPLE_DURATION_MS = 1120;
const MAX_DEVICE_PIXEL_RATIO = 2;
const GOLD_FALLBACK = "#d4a72c";

const RIPPLE_FRAMES = [
  [0, 0, 0.32, 0.15], [3, 0.14, 0.4, 0.2], [6, 0.32, 0.56, 0.3],
  [10, 0.58, 0.88, 0.51], [14, 0.78, 1.4, 0.88], [19, 0.88, 2.32, 1.58],
  [24, 0.92, 3.6, 2.68], [30, 0.92, 5.6, 4.47], [36, 0.9, 8.4, 7.12],
  [43, 0.84, 12.4, 11], [50, 0.76, 18, 16.7], [57, 0.67, 24.8, 23.6],
  [64, 0.58, 33.6, 32.6], [68, 0.51, 39.4, 38.6], [71, 0.44, 44.4, 43.7],
  [74, 0.35, 49.8, 49.2], [77, 0.26, 56, 55.5], [80, 0.18, 62.4, 62],
  [82, 0.12, 67.2, 66.9], [84, 0.075, 72, 71.8], [86, 0.04, 77, 76.8],
  [88, 0.016, 82.4, 82.3], [90, 0, 88, 88], [100, 0, 88, 88],
];

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const mix = (start, end, amount) => start + (end - start) * amount;

const cubicBezierProgress = (progress) => {
  const x1 = 0.12;
  const y1 = 0.58;
  const x2 = 0.22;
  let parameter = progress;
  for (let index = 0; index < 6; index += 1) {
    const inverse = 1 - parameter;
    const estimate = 3 * inverse * inverse * parameter * x1 + 3 * inverse * parameter * parameter * x2 + parameter ** 3;
    const derivative = 3 * inverse * inverse * x1 + 6 * inverse * parameter * (x2 - x1) + 3 * parameter * parameter * (1 - x2);
    if (Math.abs(derivative) < 0.0001) break;
    parameter = clamp(parameter - (estimate - progress) / derivative, 0, 1);
  }
  const inverse = 1 - parameter;
  return 3 * inverse * inverse * parameter * y1 + 3 * inverse * parameter * parameter + parameter ** 3;
};

const getCompletionRippleFrame = (progress) => {
  const percent = clamp(progress, 0, 1) * 100;
  let upperIndex = RIPPLE_FRAMES.findIndex(([framePercent]) => framePercent >= percent);
  if (upperIndex <= 0) upperIndex = 1;
  const lower = RIPPLE_FRAMES[upperIndex - 1];
  const upper = RIPPLE_FRAMES[upperIndex] || RIPPLE_FRAMES.at(-1);
  const segmentProgress = upper[0] === lower[0] ? 1 : (percent - lower[0]) / (upper[0] - lower[0]);
  const eased = cubicBezierProgress(clamp(segmentProgress, 0, 1));
  return { opacity: mix(lower[1], upper[1], eased), radiusX: mix(lower[2], upper[2], eased), radiusY: mix(lower[3], upper[3], eased) };
};

export default function CompletionRippleCanvas({ originX, originY, color = GOLD_FALLBACK, reduceMotion = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion || mediaQuery.matches) return undefined;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    let animationFrameId = 0;
    let startTime = 0;
    let viewportWidth = 0;
    let viewportHeight = 0;
    let drawOriginX = 0;
    let drawOriginY = 0;

    const resizeCanvas = () => {
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
      canvas.width = Math.max(1, Math.round(viewportWidth * pixelRatio));
      canvas.height = Math.max(1, Math.round(viewportHeight * pixelRatio));
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${viewportHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const numericOriginX = Number(originX);
      const numericOriginY = Number(originY);
      drawOriginX = clamp(Number.isFinite(numericOriginX) ? numericOriginX : viewportWidth / 2, 0, viewportWidth);
      drawOriginY = clamp(Number.isFinite(numericOriginY) ? numericOriginY : viewportHeight / 2, 0, viewportHeight);
    };

    const drawStroke = (radiusX, radiusY, opacity, lineWidth) => {
      context.beginPath();
      context.ellipse(drawOriginX, drawOriginY, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.globalAlpha = opacity;
      context.lineWidth = lineWidth;
      context.stroke();
    };

    const drawFrame = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const viewportMinimum = Math.min(viewportWidth, viewportHeight);
      context.clearRect(0, 0, viewportWidth, viewportHeight);
      context.strokeStyle = color || GOLD_FALLBACK;
      context.lineCap = "round";

      for (let index = 0; index < RIPPLE_COUNT; index += 1) {
        const localElapsed = elapsed - index * RIPPLE_STAGGER_MS;
        if (localElapsed < 0 || localElapsed > RIPPLE_DURATION_MS) continue;
        const frame = getCompletionRippleFrame(localElapsed / RIPPLE_DURATION_MS);
        if (frame.opacity <= 0) continue;
        const radiusX = viewportMinimum * frame.radiusX / 100;
        const radiusY = viewportMinimum * frame.radiusY / 100;
        drawStroke(radiusX, radiusY, frame.opacity * 0.16, clamp(viewportMinimum * 0.02, 14, 28));
        drawStroke(radiusX, radiusY, frame.opacity * 0.38, clamp(viewportMinimum * 0.01, 7, 14));
        drawStroke(radiusX, radiusY, frame.opacity, clamp(viewportMinimum * 0.0042, 2, 6));
      }
      context.globalAlpha = 1;

      if (elapsed < RIPPLE_DURATION_MS + (RIPPLE_COUNT - 1) * RIPPLE_STAGGER_MS) animationFrameId = window.requestAnimationFrame(drawFrame);
      else context.clearRect(0, 0, viewportWidth, viewportHeight);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, { passive: true });
    animationFrameId = window.requestAnimationFrame(drawFrame);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      context.clearRect(0, 0, viewportWidth, viewportHeight);
    };
  }, [color, originX, originY, reduceMotion]);

  if (reduceMotion) return null;
  return <canvas ref={canvasRef} className="completion-gold-ripple-canvas" aria-hidden="true" />;
}
