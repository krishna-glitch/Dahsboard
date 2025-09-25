import { useEffect, useState } from 'react';

// Simple debounced value hook to throttle rapid input changes
export default function useDebouncedValue(value, delay = 150) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

