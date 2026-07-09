"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";

/** Thin signal-colored progress line pinned to the top of the viewport. */
export default function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.set(bar.current, { scaleX: 0, transformOrigin: "left center" });
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) =>
        gsap.to(bar.current, {
          scaleX: self.progress,
          duration: 0.2,
          ease: "none",
          overwrite: true,
        }),
    });
  });

  return (
    <div className="fixed top-0 left-0 right-0 z-[950] h-[2px] pointer-events-none">
      <div ref={bar} className="h-full w-full bg-signal glow-signal" />
    </div>
  );
}
