"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

/** Fade + rise on scroll-in. Wrap any element(s). */
export default function Reveal({
  children,
  className = "",
  y = 40,
  delay = 0,
  stagger = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
  delay?: number;
  stagger?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const targets = ref.current!.children.length
        ? Array.from(ref.current!.children)
        : [ref.current!];
      gsap.from(targets, {
        opacity: 0,
        y,
        duration: 1,
        ease: "power3.out",
        stagger,
        delay,
        scrollTrigger: { trigger: ref.current, start: "top 85%" },
      });
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
