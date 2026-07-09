"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

export default function Marquee({
  items,
  baseSpeed = 40,
}: {
  items: string[];
  baseSpeed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const track = ref.current!.querySelector(".mq-track") as HTMLElement;
      const half = track.scrollWidth / 2;

      const x = gsap.to(track, {
        x: -half,
        duration: baseSpeed,
        ease: "none",
        repeat: -1,
        modifiers: { x: gsap.utils.unitize((v) => parseFloat(v) % half) },
      });

      // scroll velocity: flips direction + skews the track (speed feel)
      const skewTo = gsap.quickTo(track, "skewX", { duration: 0.4, ease: "power2.out" });
      let resetCall: gsap.core.Tween | null = null;
      ScrollTrigger.create({
        trigger: ref.current,
        start: "top bottom",
        end: "bottom top",
        onUpdate: (self) => {
          const dir = self.direction;
          gsap.to(x, { timeScale: dir === 1 ? 1 : -1, overwrite: true });
          const skew = gsap.utils.clamp(-10, 10, self.getVelocity() / -220);
          skewTo(skew);
          resetCall?.kill();
          resetCall = gsap.delayedCall(0.15, () => skewTo(0));
        },
      });
    },
    { scope: ref }
  );

  const row = [...items, ...items];

  return (
    <div
      ref={ref}
      className="overflow-hidden border-y border-bone/10 py-6 select-none"
    >
      <div className="mq-track flex gap-12 whitespace-nowrap will-change-transform">
        {row.map((t, i) => (
          <span
            key={i}
            className="text-[6vw] md:text-[3.5vw] font-normal tracking-[-0.03em] flex items-center gap-12"
          >
            {t}
            <span className="text-signal">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
