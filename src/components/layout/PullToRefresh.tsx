"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 72;
const MAX_PULL = 120;
const RESISTANCE = 0.5;

type Props = {
  onRefresh: () => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
};

export default function PullToRefresh({ onRefresh, className, children }: Props) {
  const scrollRef = useRef<HTMLElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [animating, setAnimating] = useState(true);

  const startY = useRef(0);
  const active = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const setPullValue = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (el.scrollTop > 0) return;
      if (e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const handleMove = (e: TouchEvent) => {
      if (!active.current || refreshingRef.current) return;
      if (el.scrollTop > 0) {
        active.current = false;
        setAnimating(true);
        setPullValue(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        if (pullRef.current !== 0) {
          setAnimating(false);
          setPullValue(0);
        }
        return;
      }
      // Prevent native rubber-band / pull-to-refresh while we drive the gesture.
      if (e.cancelable) e.preventDefault();
      setAnimating(false);
      setPullValue(Math.min(MAX_PULL, delta * RESISTANCE));
    };

    const handleEnd = () => {
      if (!active.current) return;
      active.current = false;
      const distance = pullRef.current;
      setAnimating(true);
      if (distance >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullValue(THRESHOLD);
        Promise.resolve()
          .then(() => onRefreshRef.current())
          .finally(() => {
            refreshingRef.current = false;
            setRefreshing(false);
            setPullValue(0);
          });
      } else {
        setPullValue(0);
      }
    };

    el.addEventListener("touchstart", handleStart, { passive: true });
    el.addEventListener("touchmove", handleMove, { passive: false });
    el.addEventListener("touchend", handleEnd, { passive: true });
    el.addEventListener("touchcancel", handleEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleStart);
      el.removeEventListener("touchmove", handleMove);
      el.removeEventListener("touchend", handleEnd);
      el.removeEventListener("touchcancel", handleEnd);
    };
  }, [setPullValue]);

  const progress = Math.max(0, Math.min(pull / THRESHOLD, 1));
  const visible = pull > 0 || refreshing;
  const transitionContent = animating ? "transform 240ms ease" : "none";
  const transitionIndicator = animating
    ? "transform 240ms ease, opacity 240ms ease"
    : "none";

  return (
    <main
      ref={scrollRef}
      className={className}
      style={{ overscrollBehaviorY: "contain" }}
    >
      <div
        aria-hidden={!visible}
        className="pointer-events-none fixed left-1/2 z-1050 flex items-center justify-center"
        style={{
          top: "calc(var(--client-header-stack-height, 70px) + 6px)",
          transform: `translate(-50%, ${Math.max(pull * 0.75 - 44, -44)}px) scale(${0.7 + progress * 0.3})`,
          opacity: refreshing ? 1 : Math.min(1, progress * 1.1),
          transition: transitionIndicator,
        }}
      >
        <div
          className="lg-bar flex h-11 w-11 items-center justify-center rounded-full"
          style={{
            boxShadow:
              "0 12px 32px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.18)",
            backgroundColor: "var(--lg-fill-active)",
            borderColor: "var(--lg-ring-strong)",
          }}
        >
          <LoaderCircle
            className={refreshing ? "h-[22px] w-[22px] animate-spin" : "h-[22px] w-[22px]"}
            strokeWidth={2.5}
            style={
              refreshing
                ? undefined
                : { transform: `rotate(${progress * 300}deg)`, transition: "none" }
            }
          />
        </div>
      </div>
      <div
        style={{
          transform: visible ? `translate3d(0, ${pull}px, 0)` : undefined,
          transition: transitionContent,
          willChange: visible ? "transform" : undefined,
        }}
      >
        {children}
      </div>
    </main>
  );
}
