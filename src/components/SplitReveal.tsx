"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";

type Props = {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p";
  /** delay before words rise, in seconds */
  delay?: number;
};

export default function SplitReveal({
  children,
  className = "",
  as = "h2",
  delay = 0,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const Tag = as as keyof React.JSX.IntrinsicElements;

  useGSAP(
    () => {
      const split = new SplitText(ref.current, {
        type: "lines,words",
        linesClass: "line-mask",
      });

      gsap.set(split.words, { yPercent: 115 });

      gsap.to(split.words, {
        yPercent: 0,
        duration: 1,
        ease: "power4.out",
        stagger: 0.035,
        delay,
        scrollTrigger: {
          trigger: ref.current,
          start: "top 88%",
        },
      });

      return () => split.revert();
    },
    { scope: ref }
  );

  return (
    // @ts-expect-error dynamic tag ref typing
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
