"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

/**
 * Brand-defining custom cursor (.КУРСОР).
 * States:
 *  - default: precise dot + soft lagging outline ring
 *  - over links/buttons: ring grows, dot hides
 *  - over [data-cursor="view"] (project cards): morphs into a solid
 *    signal-blue disc with an arrow — clean, no clipped text
 * Desktop / fine-pointer only.
 */
export default function CustomCursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const blob = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    if (!finePointer || prefersReducedMotion()) return;

    document.documentElement.classList.add("has-custom-cursor");

    const q = (el: HTMLElement | null, dur: number) => ({
      x: gsap.quickTo(el, "x", { duration: dur, ease: "power3" }),
      y: gsap.quickTo(el, "y", { duration: dur, ease: "power3" }),
    });
    const d = q(dot.current, 0.1);
    const r = q(ring.current, 0.45);
    const b = q(blob.current, 0.35);
    const tr = q(trail.current, 0.85);

    let shown = false;
    const move = (e: PointerEvent) => {
      if (!shown) {
        shown = true;
        gsap.to([dot.current, ring.current], { opacity: 1, duration: 0.3 });
        gsap.to(trail.current, { opacity: 0.25, duration: 0.5 });
      }
      d.x(e.clientX); d.y(e.clientY);
      r.x(e.clientX); r.y(e.clientY);
      b.x(e.clientX); b.y(e.clientY);
      tr.x(e.clientX); tr.y(e.clientY);
    };

    const toDefault = () => {
      gsap.to(ring.current, { scale: 1, opacity: 1, borderColor: "currentColor", duration: 0.4, ease: "kursor-out" });
      gsap.to(dot.current, { scale: 1, opacity: 1, duration: 0.3 });
      gsap.to(blob.current, { scale: 0, opacity: 0, duration: 0.35, ease: "kursor-out" });
    };
    const toLink = () => {
      gsap.to(ring.current, { scale: 1.9, opacity: 0.6, duration: 0.4, ease: "kursor-out" });
      gsap.to(dot.current, { scale: 0, opacity: 0, duration: 0.3 });
      gsap.to(blob.current, { scale: 0, opacity: 0, duration: 0.3 });
    };
    const toView = () => {
      gsap.to(ring.current, { scale: 0, opacity: 0, duration: 0.3 });
      gsap.to(dot.current, { scale: 0, opacity: 0, duration: 0.2 });
      gsap.to(blob.current, { scale: 1, opacity: 1, duration: 0.45, ease: "kursor-out" });
    };

    const resolve = (target: EventTarget | null) => {
      const el = (target as HTMLElement)?.closest?.(
        '[data-cursor="view"], a, button, [data-cursor], input, textarea'
      ) as HTMLElement | null;
      if (!el) return toDefault();
      if (el.matches('[data-cursor="view"]')) return toView();
      return toLink();
    };

    const over = (e: Event) => resolve(e.target);
    const out = (e: Event) => {
      // only reset when actually leaving an interactive element
      const related = (e as PointerEvent).relatedTarget as HTMLElement | null;
      if (!related?.closest?.('[data-cursor="view"], a, button, [data-cursor], input, textarea')) {
        toDefault();
      }
    };
    const down = () => gsap.to([ring.current, blob.current], { scale: "-=0.15", duration: 0.15 });
    const up = () => resolve(document.elementFromPoint(lastX, lastY));

    let lastX = 0, lastY = 0;
    const track = (e: PointerEvent) => { lastX = e.clientX; lastY = e.clientY; };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointermove", track);
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointermove", track);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.documentElement.classList.remove("has-custom-cursor");
    };
  });

  return (
    <div aria-hidden="true">
      {/* faint trailing halo */}
      <div
        ref={trail}
        className="fixed top-0 left-0 z-[9999] -ml-7 -mt-7 h-14 w-14 rounded-full bg-signal opacity-0 pointer-events-none blur-xl"
      />
      {/* outline ring */}
      <div
        ref={ring}
        className="fixed top-0 left-0 z-[10000] -ml-5 -mt-5 h-10 w-10 rounded-full border border-current text-bone opacity-0 pointer-events-none mix-blend-difference"
      />
      {/* precise dot */}
      <div
        ref={dot}
        className="fixed top-0 left-0 z-[10000] -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-bone opacity-0 pointer-events-none mix-blend-difference"
      />
      {/* view blob with arrow */}
      <div
        ref={blob}
        className="fixed top-0 left-0 z-[10000] -ml-9 -mt-9 rounded-full bg-signal text-bone opacity-0 pointer-events-none flex items-center justify-center glow-signal"
        style={{ transform: "scale(0)", height: "4.5rem", width: "4.5rem" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 17L17 7M17 7H8M17 7V16" />
        </svg>
      </div>
    </div>
  );
}
