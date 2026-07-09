"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

type LenisLike = { scrollTo?: (target: number, opts?: object) => void };

/** Floating back-to-top button with a scroll-progress ring. */
export default function BackToTop() {
  const ref = useRef<HTMLButtonElement>(null);
  const circ = useRef<SVGCircleElement>(null);

  useGSAP(() => {
    const R = 22;
    const C = 2 * Math.PI * R;
    gsap.set(circ.current, { strokeDasharray: C, strokeDashoffset: C });
    gsap.set(ref.current, { autoAlpha: 0, y: 24 });

    let visible = false;
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) => {
        gsap.set(circ.current, { strokeDashoffset: C * (1 - self.progress) });
        const show = self.scroll() > 600;
        if (show !== visible) {
          visible = show;
          gsap.to(ref.current, {
            autoAlpha: show ? 1 : 0,
            y: show ? 0 : 24,
            duration: 0.4,
            ease: "power2.out",
            overwrite: "auto",
          });
        }
      },
    });
  });

  const toTop = () => {
    const lenis = (window as unknown as { lenis?: LenisLike }).lenis;
    if (lenis?.scrollTo) lenis.scrollTo(0, { duration: 1.4 });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      ref={ref}
      onClick={toTop}
      aria-label="Наверх"
      data-cursor
      className="group fixed bottom-6 right-6 z-[850] h-12 w-12 rounded-full border border-bone/20 bg-ink/60 backdrop-blur-sm flex items-center justify-center text-bone hover:border-signal transition-colors"
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle
          ref={circ}
          cx="24"
          cy="24"
          r="22"
          stroke="var(--color-signal)"
          strokeWidth="1.5"
        />
      </svg>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="transition-transform duration-300 group-hover:-translate-y-1"
        aria-hidden="true"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
