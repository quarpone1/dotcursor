"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./presentation.module.css";

declare global {
  interface Window {
    mountDotcursorHairline?: (stage: HTMLElement, svg: SVGSVGElement) => () => void;
  }
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export function HeroVisual() {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !stage.current || !svg.current) return;
    return window.mountDotcursorHairline?.(stage.current, svg.current);
  }, [ready]);

  useEffect(() => {
    const player = video.current;
    if (reduced || !player) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        void player.play().catch(() => {});
      } else {
        player.pause();
      }
    });
    observer.observe(player);
    return () => {
      observer.disconnect();
      player.pause();
    };
  }, [reduced]);

  useGSAP(() => {
    if (reduced) return;
    gsap.fromTo("[data-hero-figure]", { y: 12, opacity: 0.5 }, {
      y: 0, opacity: 1, duration: 0.85, ease: "power3.out",
    });
    gsap.to("[data-hero-wash]", {
      opacity: 0.86,
      duration: 5.5,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", toggleActions: "play pause resume pause" },
    });
  }, { scope: root, dependencies: [reduced], revertOnUpdate: true });

  return (
    <div ref={root} className={styles.heroVisual} aria-hidden="true">
      {!reduced && (
        <video ref={video} muted loop playsInline preload="none" poster="/video/poster.jpg">
          <source src="/video/showreel.mp4" type="video/mp4" />
        </video>
      )}
      <div className={styles.heroWash} data-hero-wash />
      <div className={styles.heroFigure} data-hero-figure>
        <div ref={stage} className={styles.hairlineStage} data-hairline="document-scanner" data-hairline-theme="dark">
          <svg ref={svg} viewBox="0 0 400 320" />
        </div>
      </div>
      <Script src="/ai-processes/hairline.js" onReady={() => setReady(true)} />
    </div>
  );
}

export function PresentationMotion() {
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.utils.toArray<HTMLElement>("[data-ai-reveal]").forEach((element) => {
        gsap.from(element, {
          y: 18, duration: 0.5, ease: "power2.out", immediateRender: false,
          scrollTrigger: { trigger: element, start: "top 92%", once: true },
        });
      });
    });
    return () => media.revert();
  });

  return null;
}
