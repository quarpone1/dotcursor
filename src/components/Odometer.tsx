"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

/**
 * Mechanical odometer counter — each digit rolls up from 0 to its target
 * on scroll-in. Heights are em-based so it inherits any font size.
 */
export default function Odometer({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const digits = String(value).split("");

  useGSAP(
    () => {
      const strips = ref.current!.querySelectorAll<HTMLElement>(".od-strip");
      ScrollTrigger.create({
        trigger: ref.current,
        start: "top 85%",
        once: true,
        onEnter: () => {
          strips.forEach((strip, i) => {
            const target = Number(strip.dataset.d);
            gsap.fromTo(
              strip,
              { yPercent: 0 },
              {
                yPercent: -target * 10, // each number = 10% of the 0–9 strip
                duration: 1.6,
                ease: "power4.out",
                delay: i * 0.12,
              }
            );
          });
        },
      });
    },
    { scope: ref }
  );

  return (
    <span ref={ref} className={`inline-flex ${className}`} aria-label={String(value)}>
      {digits.map((d, i) => (
        <span
          key={i}
          className="inline-block overflow-hidden"
          style={{ height: "1em", lineHeight: 1 }}
        >
          <span
            className="od-strip flex flex-col"
            data-d={d}
            style={{ willChange: "transform" }}
          >
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n} style={{ height: "1em", lineHeight: 1 }}>
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
