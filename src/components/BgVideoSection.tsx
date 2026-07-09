"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";

// Видео: public/video/showreel.mp4 (+ poster.jpg).
// Десктоп — покадровая перемотка по скроллу (pin + scrub).
// Мобильные — обычный автоплей-луп: iOS не рендерит scrub через currentTime.
const HAS_VIDEO = true;
const VIDEO_SRC = "/video/showreel.mp4";
const POSTER_SRC = "/video/poster.jpg";

export default function BgVideoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const video = videoRef.current;
      const mm = gsap.matchMedia();

      // ===== Десктоп: pin + scrub =====
      // ВАЖНО: триггер создаётся синхронно (не ждём loadedmetadata) — иначе
      // pin-спейсер появляется позже соседних триггеров, позиции сбиваются
      // и скролл «перепрыгивает» следующую секцию.
      mm.add("(min-width: 768px)", () => {
        video?.pause();

        const split = new SplitText(textRef.current, { type: "words" });
        gsap.set(split.words, { opacity: 0.12 });

        const tl = gsap.timeline();
        tl.to(split.words, {
          opacity: 1,
          ease: "none",
          stagger: 0.3,
          duration: 0.5,
        }).to({}, { duration: 1.4 }); // hold до конца скраба

        ScrollTrigger.create({
          trigger: ref.current,
          start: "top top",
          end: "+=300%",
          pin: ".bgv-stage",
          scrub: 1,
          anticipatePin: 1,
          animation: tl,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            // duration читаем лениво: пока метаданные не загрузились — пропускаем
            const dur = video?.duration;
            if (video && dur && isFinite(dur)) {
              const t = self.progress * dur;
              if (Math.abs(video.currentTime - t) > 0.01) video.currentTime = t;
            }
          },
        });

        return () => split.revert();
      });

      // ===== Мобильные: автоплей-луп, без пина =====
      mm.add("(max-width: 767px)", () => {
        if (video) {
          video.loop = true;
          video.play().catch(() => {
            /* автоплей заблокирован — останется постер */
          });
        }

        const split = new SplitText(textRef.current, { type: "words" });
        gsap.fromTo(
          split.words,
          { opacity: 0.12 },
          {
            opacity: 1,
            ease: "none",
            stagger: 0.06,
            scrollTrigger: {
              trigger: textRef.current,
              start: "top 80%",
              end: "bottom 50%",
              scrub: true,
            },
          }
        );

        return () => {
          split.revert();
          video?.pause();
        };
      });

      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <section ref={ref} className="relative">
      <div className="bgv-stage relative h-dvh overflow-hidden bg-ink text-bone">
        {/* ===== ФОНОВОЕ ВИДЕО ===== */}
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

        {/* overlaid text */}
        <div className="relative z-10 h-full flex items-center px-shell">
          <h2 ref={textRef} className="h2 max-w-[18ch]">
            Дизайн, который двигает бренды вперёд. Каждый пиксель — на своём месте.
          </h2>
        </div>
      </div>
    </section>
  );
}
