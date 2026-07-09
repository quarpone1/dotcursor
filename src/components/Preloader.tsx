"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import Logo from "./Logo";

export default function Preloader() {
  const root = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const rRef = useRef<HTMLSpanElement>(null);
  const bRef = useRef<HTMLSpanElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const scanbar = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useGSAP(
    () => {
      const lenis = (window as unknown as {
        lenis?: { stop: () => void; start: () => void };
      }).lenis;
      lenis?.stop();
      document.body.style.overflow = "hidden";

      const finish = () => {
        lenis?.start();
        document.body.style.overflow = "";
        setHidden(true);
      };
      const setCount = (v: number) => {
        const el = root.current?.querySelector(".pl-count");
        if (el) el.textContent = String(Math.round(v)).padStart(3, "0");
      };

      // ---- reduced-motion: minimal, no glitch ----
      if (prefersReducedMotion()) {
        const c = { v: 0 };
        gsap
          .timeline({ onComplete: finish })
          .to(c, { v: 100, duration: 1, onUpdate: () => setCount(c.v) })
          .to(".pl-bar", { scaleX: 1, duration: 1 }, 0)
          .to(root.current, { opacity: 0, duration: 0.4 });
        return;
      }

      const rnd = gsap.utils.random;
      const slice = () => `inset(${rnd(0, 68)}% 0 ${rnd(0, 68)}% 0)`;
      let alive = true;

      // a single snappy glitch jolt
      const jolt = (amp: number) => {
        gsap.set(rRef.current, { x: rnd(-amp, amp), y: rnd(-amp * 0.4, amp * 0.4), clipPath: slice() });
        gsap.set(bRef.current, { x: rnd(-amp, amp), y: rnd(-amp * 0.4, amp * 0.4), clipPath: slice() });
        gsap.set(stack.current, { x: rnd(-amp * 0.3, amp * 0.3), skewX: rnd(-8, 8) });
        gsap.to([rRef.current, bRef.current, stack.current], {
          x: 0, y: 0, skewX: 0, clipPath: "inset(0 0 0 0)",
          duration: 0.12, ease: "power2.out",
        });
      };
      const ambient = () => {
        if (!alive) return;
        jolt(rnd(7, 16));
        gsap.delayedCall(rnd(0.1, 0.5), ambient);
      };
      const sweep = () => {
        if (!alive) return;
        gsap.fromTo(
          scanbar.current,
          { yPercent: -120, opacity: 0.9 },
          {
            yPercent: 560, opacity: 0.9, duration: rnd(0.7, 1.4), ease: "none",
            onComplete: () => gsap.delayedCall(rnd(0.2, 0.7), sweep),
          }
        );
      };

      // ---- INTRO: slam in from RGB chaos ----
      const intro = gsap.timeline();
      intro
        .set(stack.current, { opacity: 0, scale: 1.6, filter: "blur(30px)" })
        .set(rRef.current, { x: -90, opacity: 0 })
        .set(bRef.current, { x: 90, opacity: 0 })
        .to(stack.current, { opacity: 1, duration: 0.06 })
        .to(stack.current, { scale: 1, filter: "blur(0px)", duration: 0.7, ease: "expo.out" })
        .to([rRef.current, bRef.current], { x: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, "<")
        .add(() => jolt(24), "<0.1")
        .add(() => jolt(18), "+=0.1")
        .add(() => { ambient(); sweep(); });

      // ---- EXIT: glitch storm → flash → fly apart → slice wipe ----
      const exit = () => {
        alive = false;
        gsap.killTweensOf([rRef.current, bRef.current, stack.current]);
        const tl = gsap.timeline({ onComplete: finish });
        let t = 0;
        for (let i = 0; i < 7; i++) {
          const a = 18 + i * 8;
          tl.set(rRef.current, { x: rnd(-a, a), y: rnd(-a * 0.4, a * 0.4), clipPath: slice() }, t)
            .set(bRef.current, { x: rnd(-a, a), y: rnd(-a * 0.4, a * 0.4), clipPath: slice() }, t)
            .set(stack.current, { x: rnd(-a * 0.3, a * 0.3), skewX: rnd(-12, 12), scale: 1 + i * 0.012 }, t);
          t += 0.055;
        }
        tl.set(flash.current, { opacity: 0.95 }, t)
          .to(flash.current, { opacity: 0, duration: 0.3 }, t + 0.03)
          .to(rRef.current, { x: -240, opacity: 0, duration: 0.5, ease: "power3.in" }, t)
          .to(bRef.current, { x: 240, opacity: 0, duration: 0.5, ease: "power3.in" }, t)
          .to(stack.current, { scale: 1.2, opacity: 0, filter: "blur(14px)", skewX: 0, duration: 0.5, ease: "power3.in" }, t)
          .to(".pl-meta", { opacity: 0, duration: 0.2 }, t)
          .to(root.current, { clipPath: "inset(0 0 100% 0)", duration: 0.8, ease: "power4.inOut" }, t + 0.35);
      };

      // ---- counter + bar (drives the exit on complete) ----
      const c = { v: 0 };
      gsap.to(c, {
        v: 100, duration: 2.6, ease: "power1.inOut",
        onUpdate: () => setCount(c.v), onComplete: exit,
      });
      gsap.to(".pl-bar", { scaleX: 1, duration: 2.6, ease: "power1.inOut" });
      // count "stutter" flickers
      gsap.to(".pl-count", { skewX: 16, duration: 0.05, repeat: 5, yoyo: true, delay: 0.8 });
    },
    { scope: root }
  );

  if (hidden) return null;

  return (
    <div
      ref={root}
      className="pl-scan fixed inset-0 z-[9999] bg-ink flex items-center justify-center overflow-hidden"
      style={{ clipPath: "inset(0 0 0% 0)" }}
    >
      <div ref={scanbar} className="pl-scanbar" style={{ top: 0 }} />
      <div
        ref={flash}
        className="absolute inset-0 z-[4] pointer-events-none opacity-0"
        style={{ background: "#cfe0ff", mixBlendMode: "screen" }}
      />

      <div className="flex flex-col items-center gap-10">
        <div className="pl-glitch">
          <div ref={stack} className="relative inline-block">
            <Logo className="block h-[13vw] md:h-[6.5vw] w-auto text-bone" />
            <span
              ref={rRef}
              className="pl-layer pl-r absolute top-0 left-0"
              style={{ color: "#ff2d4d", mixBlendMode: "screen" }}
            >
              <Logo className="block h-[13vw] md:h-[6.5vw] w-auto" />
            </span>
            <span
              ref={bRef}
              className="pl-layer pl-b absolute top-0 left-0"
              style={{ color: "#2f5dff", mixBlendMode: "screen" }}
            >
              <Logo className="block h-[13vw] md:h-[6.5vw] w-auto" />
            </span>
          </div>
        </div>

        <div className="pl-meta w-[60vw] max-w-md">
          <div className="flex justify-between label text-steel mb-3">
            <span>Загрузка</span>
            <span className="pl-count tabular-nums">000</span>
          </div>
          <div className="h-px w-full bg-micro overflow-hidden">
            <div className="pl-bar h-full w-full bg-signal origin-left scale-x-0 glow-signal" />
          </div>
        </div>
      </div>
    </div>
  );
}
