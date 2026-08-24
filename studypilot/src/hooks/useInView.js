import { useEffect, useRef, useState } from "react";

/**
 * Tells you when an element has scrolled into view, once.
 *
 * Reveal animations should not replay every time the user scrolls back past a
 * section, so the observer disconnects on the first intersection. If
 * IntersectionObserver is unavailable the content is shown immediately rather
 * than left invisible.
 */
export default function useInView({ threshold = 0.2, rootMargin = "0px 0px -10% 0px" } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return [ref, inView];
}
