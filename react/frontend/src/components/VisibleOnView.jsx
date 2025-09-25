import React, { useEffect, useRef, useState } from 'react';

// Renders children only after the container becomes visible in viewport.
// Props:
// - rootMargin: IntersectionObserver rootMargin (e.g., '200px')
// - minHeight: reserve height to avoid CLS (px)
// - once: if true (default), stays mounted after first visibility
export default function VisibleOnView({ children, rootMargin = '200px', minHeight = 280, once = true }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current || visible) return;
    const el = ref.current;
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) obs.disconnect();
          break;
        }
      }
    }, { root: null, rootMargin, threshold: 0.01 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible, rootMargin, once]);

  return (
    <div ref={ref} style={{ minHeight }}>
      {visible ? children : null}
    </div>
  );
}

