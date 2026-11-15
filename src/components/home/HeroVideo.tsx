"use client";

import { useEffect, useRef } from "react";

/** Fallback: start the video this long after the page finished loading if the visitor has not interacted yet. */
const START_DELAY_MS = 8000;

/**
 * The poster (a frame of the video) is what the visitor sees first and what counts for LCP.
 * The video itself is attached only after the page has loaded and the visitor interacts (or 8 s pass), so that its
 * download and decoding never compete with the first paint. Visually the hero is identical, the motion starts a moment later.
 * Autoplay needs `muted` set as a DOM property (React's attribute isn't enough in some browsers).
 */
export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // poster only

    let timer: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    const play = () => {
      if (started) return;
      started = true;
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, play));
      el.src = "/brand/hero.mp4";
      el.preload = "auto";
      el.play()?.catch(() => {});
    };
    // the first interaction (or a quiet moment after load) starts the motion
    events.forEach((e) => window.addEventListener(e, play, { once: true, passive: true }));
    const arm = () => {
      timer = setTimeout(play, START_DELAY_MS);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, play));
      window.removeEventListener("load", arm);
    };
  }, []);
  return (
    <>
      {/* The poster is a real <img> (the LCP element, fetched with high priority); the video sits on top of it
          and stays transparent until its first frame, so the hero looks exactly like before. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a 92 KB poster that must stay byte-identical to the video's first frame */}
      <img className="hero-poster" src="/brand/hero-poster.jpg" alt="" fetchPriority="high" decoding="async" aria-hidden="true" />
      <video ref={ref} muted loop playsInline preload="none" aria-hidden="true" />
    </>
  );
}
