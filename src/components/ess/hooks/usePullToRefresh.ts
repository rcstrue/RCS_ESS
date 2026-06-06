'use client';

import { useRef, useState, useCallback, RefObject } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function usePullToRefresh<T extends HTMLElement>(
  options: PullToRefreshOptions
) {
  const { onRefresh, threshold = 80 } = options;

  const containerRef = useRef<T>(null);
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const currentPullRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;

    // Only pull if at top of scroll
    if (container.scrollTop > 0) return;

    startYRef.current = e.touches[0].clientY;
    currentPullRef.current = 0;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isRefreshing) return;

      const container = containerRef.current;
      if (!container) return;

      // Only activate if at top
      if (container.scrollTop > 0) {
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      const diff = e.touches[0].clientY - startYRef.current;
      if (diff <= 0) {
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      // Dampen the pull distance (rubber band effect)
      const dampened = Math.min(diff * 0.4, 120);
      currentPullRef.current = dampened;
      setIsPulling(true);
      setPullDistance(dampened);
    },
    [isRefreshing]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || isRefreshing) return;

    if (currentPullRef.current >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } catch {
        // swallow errors — the onRefresh callback should handle its own toast
      } finally {
        setIsRefreshing(false);
      }
    }

    setIsPulling(false);
    setPullDistance(0);
    currentPullRef.current = 0;
  }, [isPulling, isRefreshing, threshold, onRefresh]);

  return {
    containerRef,
    isPulling,
    pullDistance,
    isRefreshing,
    pullIndicatorStyle: {
      height: isRefreshing ? 48 : pullDistance,
      overflow: 'hidden' as const,
      transition: isRefreshing || !isPulling ? 'height 0.3s ease' : 'none',
    },
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

export default usePullToRefresh;
