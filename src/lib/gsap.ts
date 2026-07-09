"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(
    ScrollTrigger,
    SplitText,
    ScrambleTextPlugin,
    CustomEase,
    useGSAP
  );

  // Signature easing — used across the site for a cohesive motion feel.
  if (!CustomEase.get?.("kursor")) {
    CustomEase.create("kursor", "0.62, 0.05, 0.01, 0.99");
    CustomEase.create("kursor-out", "0.16, 1, 0.3, 1");
  }

  // Respect reduced-motion: kill heavy scroll motion, keep content visible.
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    gsap.globalTimeline.timeScale(2);
  }
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export { gsap, ScrollTrigger, SplitText, ScrambleTextPlugin, CustomEase, useGSAP };
