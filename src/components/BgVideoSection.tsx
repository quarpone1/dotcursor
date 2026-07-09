"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";

// Когда видео готово: положи public/video/showreel.mp4 (+ poster.jpg),
// поставь HAS_VIDEO = true. Видео перематывается кадрами по скроллу.
// Совет: кодируй с частыми keyframes (ffmpeg -g 1) — иначе scrub дёргается.
const HAS_VIDEO = true;
const VIDEO_SRC = "/video/showreel.mp4";
const POSTER_SRC = "/video/poster.jpg";

export default function BgVideoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      if (HAS_VIDEO && videoRef.current) {
        const video = videoRef.current;

        const setup = () => {
          const dur = video.duration || 1;

          // text reveal lives on the SAME pinned scrub timeline as the video,
          // so words start brightening together with the footage (not before).
          const split = new SplitText(textRef.current, { type: "words" });
          gsap.set(split.words, { opacity: 0.12 });

          const tl = gsap.timeline();
          tl.to(split.words, {
            opacity: 1,
            ease: "none",
            stagger: 0.3,
            duration: 0.5,
          }).to({}, { duration: 1.4 }); // hold through the rest of the scrub

          ScrollTrigger.create({
            trigger: ref.current,
            start: "top top",
            end: "+=300%",
            pin: ".bgv-stage",
            scrub: 1,
            animation: tl,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const t = self.progress * dur;
              if (Math.abs(video.currentTime - t) > 0.01) video.currentTime = t;
            },
          });
          ScrollTrigger.refresh();
        };

        video.pause();
        if (video.readyState >= 1) setup();
        else video.addEventListener("loadedmetadata", setup, { once: true });
      } else {
        // placeholder mode
        gsap.fromTo(
          ".bgv-media",
          { scale: 1.2, yPercent: -5 },
          {
            scale: 1,
            yPercent: 5,
            ease: "none",
            scrollTrigger: {
              trigger: ref.current,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );
      }
    },
    { scope: ref }
  );

  return (
    <section ref={ref} className="relative">
      <div className="bgv-stage relative h-dvh overflow-hidden bg-ink text-bone">
        {/* ===== ФОНОВОЕ ВИДЕО (scrub по скроллу) ===== */}
        <div className="bgv-media absolute inset-0 will-change-transform">
          {HAS_VIDEO ? (
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              src={VIDEO_SRC}
              poster={POSTER_SRC}
              muted
              playsInline
              preload="auto"
            />
          ) : (
            <div className="relative h-full w-full flex items-center justify-center bg-micro">
              <div className="atmosphere" />
              <span className="label text-steel relative z-10 border border-steel/30 rounded-card px-5 py-3">
                Слот под scrub-видео — public/video/showreel.mp4
              </span>
            </div>
          )}
        </div>

        {/* затемнение для читаемости */}
        <div className="absolute inset-0 bg-ink/45" />

        {/* ambient light */}
        <div className="glow-orb w-[35vw] h-[35vw] top-[20%] right-[8%]" />

        {/* overlaid text — revealed in sync with the video scrub */}
        <div className="relative z-10 h-full flex items-center px-shell">
          <h2 ref={textRef} className="h2 max-w-[18ch]">
            Дизайн, который двигает бренды вперёд. Каждый пиксель — на своём месте.
          </h2>
        </div>
      </div>
    </section>
  );
}
