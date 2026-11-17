"use client";

import { useEffect, useRef } from "react";

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Set both mute properties before attaching the source for inline autoplay on iOS.
    el.muted = true;
    el.defaultMuted = true;

    const play = () => {
      if (document.visibilityState === "visible" && el.paused) {
        // Browsers can still reject autoplay. The existing poster remains available.
        void el.play()?.catch(() => {});
      }
    };

    el.addEventListener("canplay", play, { once: true });
    document.addEventListener("visibilitychange", play);
    if (!el.getAttribute("src")) el.src = "/brand/hero.mp4";
    play();

    return () => {
      el.removeEventListener("canplay", play);
      document.removeEventListener("visibilitychange", play);
    };
  }, []);
  return (
    <>
      {/* The poster is a real <img> (the LCP element, fetched with high priority); the video sits on top of it
          and stays transparent until its first frame, so the hero looks exactly like before. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a 92 KB poster that must stay byte-identical to the video's first frame */}
      <img className="hero-poster" src="/brand/hero-poster.jpg" alt="" fetchPriority="high" decoding="async" aria-hidden="true" />
      <video ref={ref} autoPlay muted playsInline loop preload="auto" aria-hidden="true" />
    </>
  );
}
