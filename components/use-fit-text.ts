import { useCallback, useEffect, useRef, useState } from 'react';

interface FitOptions {
  min?: number;      // minimum font size px
  max?: number;      // maximum font size px
  heightRatio?: number; // portion of container height allowed
  widthRatio?: number;  // portion of container width allowed
  debounceMs?: number;  // debounce for rapid updates
}

// Binary search fit algorithm to find largest font size that fits within container constraints.
export function useFitText(
  textRef: React.RefObject<HTMLElement>,
  containerRef: React.RefObject<HTMLElement>,
  measureRef: React.RefObject<HTMLElement> | null,
  deps: any,
  opts: FitOptions = {}
) {
  const { min = 12, max = 72, heightRatio = 0.9, widthRatio = 0.95, debounceMs = 0 } = opts;
  const [size, setSize] = useState<number>(Math.min(48, max));
  const rafRef = useRef<number>();
  const timeoutRef = useRef<number>();

  const compute = useCallback(() => {
  const container = containerRef.current;
  const el = textRef.current;
  const measureEl = (measureRef && measureRef.current) || el;
  if (!container || !el || !measureEl) return;
  const maxHeight = container.clientHeight * heightRatio; // total allowed height inside stage
  // width: real usable width is the measured element's clientWidth (after max-w constraints)
  const targetClientWidth = measureEl.clientWidth || container.clientWidth;
  const maxWidth = targetClientWidth * widthRatio;
    let lo = min;
    let hi = max;
    let best = min;
    // Avoid layout thrash by turning off transitions while fitting.
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    while (lo <= hi) {
      const mid = Math.floor((lo + hi)/2);
  el.style.fontSize = mid + 'px';
  // Force reflow and measure the wrapper (which includes padding)
  const h = measureEl.scrollHeight;
  const w = measureEl.scrollWidth;
  const over = h > maxHeight || w > maxWidth;
      if (over) {
        hi = mid - 1;
      } else {
        best = mid;
        lo = mid + 1;
      }
    }
    el.style.fontSize = best + 'px';
    el.style.transition = prevTransition;
    setSize(best);
  }, [textRef, containerRef, measureRef, min, max, heightRatio, widthRatio]);

  useEffect(() => {
    if (debounceMs > 0) {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(compute);
      }, debounceMs) as unknown as number;
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    }
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, compute]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [compute, containerRef, measureRef]);

  return size;
}
