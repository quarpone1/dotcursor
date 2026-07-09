"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

/**
 * Looping RGB-split glitch text (same effect as the preloader).
 * Subtle chromatic aberration at rest + periodic glitch bursts.
 */
export default function GlitchText({
  children,
  className = "",
  as = "h2",
}: {
  children: string;
  className?: string;
  as?: "h1" | "h2" | "h3" | "span";
}) {
  const stack = useRef<HTMLElement>(null);
  const rRef = useRef<HTMLSpanElement>(null);
  const bRef = useRef<HTMLSpanElement>(null);
  const Tag = as as keyof React.JSX.IntrinsicElements;

  // rest offsets — a permanent faint chromatic fringe
  const RX = 1.6;
  const BX = -1.6;

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set([rRef.current, bRef.current], { opacity: 0 });
        return;
      }

      const rnd = gsap.utils.random;
      const slice = () => `inset(${rnd(0, 72)}% 0 ${rnd(0, 72)}% 0)`;
      let alive = true;

      gsap.set(rRef.current, { x: RX });
      gsap.set(bRef.current, { x: BX });

      const rest = () => {
        gsap.to(rRef.current, { x: RX, y: 0, clipPath: "inset(0 0 0 0)", duration: 0.14, ease: "power2.out" });
        gsap.to(bRef.current, { x: BX, y: 0, clipPath: "inset(0 0 0 0)", duration: 0.14, ease: "power2.out" });
        gsap.to(stack.current, { x: 0, skewX: 0, duration: 0.14, ease: "power2.out" });
      };

      const burst = () => {
        if (!alive) return;
        const tl = gsap.timeline({
          onComplete: () => gsap.delayedCall(rnd(0.5, 1.9), burst),
        });
        const n = Math.round(rnd(3, 6));
        for (let i = 0; i < n; i++) {
          const a = rnd(10, 24);
          tl.set(rRef.current, { x: rnd(-a, a), y: rnd(-a * 0.35, a * 0.35), clipPath: slice() }, i * 0.06)
            .set(bRef.current, { x: rnd(-a, a), y: rnd(-a * 0.35, a * 0.35), clipPath: slice() }, i * 0.06)
            .set(stack.current, { x: rnd(-a * 0.25, a * 0.25), skewX: rnd(-7, 7) }, i * 0.06);
        }
        tl.add(rest, n * 0.06);
      };

      // first burst shortly after mount
      gsap.delayedCall(0.4, burst);

      return () => {
        alive = false;
      };
    },
    { scope: stack }
  );

  return (
    // @ts-expect-error dynamic tag ref typing
    <Tag ref={stack} className={`relative inline-block ${className}`}>
      <span className="block">{children}</span>
      <span
        ref={rRef}
        aria-hidden="true"
        className="absolute top-0 left-0 w-full pointer-events-none"
        style={{ color: "#ff2d4d", mixBlendMode: "screen" }}
      >
        {children}
      </span>
      <span
        ref={bRef}
        aria-hidden="true"
        className="absolute top-0 left-0 w-full pointer-events-none"
        style={{ color: "#2f5dff", mixBlendMode: "screen" }}
      >
        {children}
      </span>
    </Tag>
  );
}
