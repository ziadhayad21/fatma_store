"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Doodle } from "@/components/ui/Doodle";

interface ReelItem {
  id: string;
  title: string;
  categoryName: string;
  badge: string;
  videoSrc: string;
  posterSrc: string;
  href: string;
  position: "left" | "center" | "right";
}

const REELS: ReelItem[] = [
  {
    id: "bag",
    title: "شنطة Polka Dot صفرا",
    categoryName: "الشنط",
    badge: "خفيفة وعملية",
    videoSrc: "/video/bag.mp4",
    posterSrc: "/products/bag-polka.jpg",
    href: "/collections/bags",
    position: "left",
  },
  {
    id: "bibs",
    title: "مريلة مطبخ Chef Fatma",
    categoryName: "المريلات",
    badge: "الأكثر طلباً",
    videoSrc: "/video/bibs.mp4",
    posterSrc: "/products/apron-chef.jpg",
    href: "/collections/aprons",
    position: "center",
  },
  {
    id: "towels",
    title: "فوطة مطبخ قطن مصري",
    categoryName: "الفوط",
    badge: "قطن 100%",
    videoSrc: "/video/towels.mp4",
    posterSrc: "/products/towel-cream.jpg",
    href: "/collections/towels",
    position: "right",
  },
];

function ReelCard({ item }: { item: ReelItem }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;

    // Use IntersectionObserver to play video only when visible in viewport
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play()?.then(() => setIsPlaying(true)).catch(() => {});
          } else {
            video.pause();
            setIsPlaying(false);
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, []);

  const toggleSound = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setIsMuted(next);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play()?.then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const isCenter = item.position === "center";

  return (
    <div
      className={`reels-card reels-card-${item.position}${isCenter ? " is-focal" : ""}`}
      onClick={togglePlay}
      role="region"
      aria-label={`${item.categoryName}: ${item.title}`}
    >
      {/* Background Poster (clean fallback before video loads) */}
      <div className={`reels-poster${isLoaded ? " is-hidden" : ""}`}>
        <Image
          src={item.posterSrc}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 30vw, 360px"
          priority={isCenter}
          className="reels-poster-img"
        />
      </div>

      {/* Video Element */}
      <video
        ref={videoRef}
        src={item.videoSrc}
        poster={item.posterSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="reels-video"
        onLoadedData={() => setIsLoaded(true)}
      />

      {/* Subtle vignette & gradient overlay */}
      <div className="reels-overlay" />

      {/* Top Bar: Badge & Sound Toggle */}
      <div className="reels-top-bar">
        <span className={`reels-badge ${isCenter ? "reels-badge-focal" : ""}`}>
          <span className="reels-badge-dot" />
          {item.badge}
        </span>

        <button
          type="button"
          onClick={toggleSound}
          className="reels-sound-btn"
          aria-label={isMuted ? "تشغيل الصوت" : "كتم الصوت"}
          title={isMuted ? "تشغيل الصوت" : "كتم الصوت"}
        >
          {isMuted ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
      </div>

      {/* Play/Pause state indicator on pause */}
      {!isPlaying && (
        <div className="reels-pause-indicator" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      )}

      {/* Bottom Content & CTA */}
      <div className="reels-bottom-bar" onClick={(e) => e.stopPropagation()}>
        <div className="reels-meta">
          <span className="reels-cat">{item.categoryName}</span>
          <h3 className="reels-title">{item.title}</h3>
        </div>
        <Link href={item.href} className="reels-shop-btn">
          Shop ←
        </Link>
      </div>
    </div>
  );
}

export function VideoReelsSection() {
  return (
    <section className="sec reels-sec" aria-labelledby="reels-heading">
      <div className="wrap">
        {/* Section Header */}
        <div className="sh reels-head rv">
          <div>
            <span className="eyebrow">فيديوهات وحكايات</span>
            <h2 className="h2" id="reels-heading">
              شوف منتجاتنا{" "}
              <span className="mark">
                على الحقيقة
                <Doodle kind="underline" className="dl-underline" />
              </span>
            </h2>
          </div>
          <p className="reels-sub">
            فيديوهات سريعة من الطبيعة — خامات قماش طبيعية، ألوان ثابتة، وتفاصيل بتوقيعك.
          </p>
        </div>

        {/* Asymmetric Stepped Video Gallery */}
        <div className="reels-gallery">
          {REELS.map((item) => (
            <ReelCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
