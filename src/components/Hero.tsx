"use client";

import { useRef } from "react";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import LiquidBackground from "./LiquidBackground";

export default function Hero() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ delay: 2.5 }); // begins as preloader lifts

      tl.from(".hero-line .ch", {
        yPercent: 120,
        rotate: 6,
        duration: 1.2,
        ease: "power4.out",
        stagger: 0.022,
      })
        .from(
          ".hero-sub",
          { opacity: 0, y: 28, duration: 1, ease: "power2.out" },
          "-=0.7"
        )
        .from(
          ".hero-meta > *",
          { opacity: 0, y: 16, duration: 0.7, stagger: 0.12, ease: "power2.out" },
          "-=0.6"
        )
        .from(
          ".hero-scroll",
          { opacity: 0, duration: 0.6, ease: "power2.out" },
          "-=0.3"
        );

      // playful kinetic letters — each char pops on hover
      if (!prefersReducedMotion()) {
        ref.current!.querySelectorAll<HTMLElement>(".hero-line .ch").forEach((ch) => {
          ch.addEventListener("pointerenter", () => {
            gsap
              .timeline({ overwrite: true })
              .to(ch, {
                yPercent: -16,
                color: "#2f5dff",
                duration: 0.15,
                ease: "power2.out",
              })
              .to(ch, {
                yPercent: 0,
                color: "#efeeec",
                duration: 0.8,
                ease: "elastic.out(1, 0.35)",
              })
              .set(ch, { clearProps: "color" });
          });
        });
      }

      // parallax: title drifts up, subline lags — adds depth
      gsap.to(".hero-title", {
        yPercent: 18,
        ease: "none",
        scrollTrigger: {
          trigger: ref.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
      gsap.to(".hero-foot", {
        yPercent: -40,
        ease: "none",
        scrollTrigger: {
          trigger: ref.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      // subline dissolves into blur + transparency on scroll.
      // On the wrapper, so it doesn't fight the entrance tween on .hero-sub.
      gsap.fromTo(
        ".hero-sub-wrap",
        { opacity: 1, filter: "blur(0px)" },
        {
          opacity: 0,
          filter: "blur(12px)",
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: ref.current,
            start: "top top",
            end: "40% top",
            scrub: true,
          },
        }
      );
    },
    { scope: ref }
  );

  // each word is its own span (animatable); spacing via margin
  const lines = [
    ["Новый", "класс"],
    ["цифрового", "ремесла"],
  ];

  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-dvh flex flex-col justify-end px-shell pb-16 md:pb-24 bg-ink text-bone overflow-hidden"
    >
      <div className="absolute inset-0 z-0">
        <LiquidBackground />
      </div>
      <div className="glow-orb w-[40vw] h-[40vw] top-[8%] right-[10%]" />
      <div
        className="glow-orb w-[28vw] h-[28vw] bottom-[12%] left-[-5%]"
        style={{ animationDelay: "-4s" }}
      />

      <div className="hero-title relative z-10">
        {lines.map((line, li) => (
          <div key={li} className="hero-line line-mask display">
            {line.map((w, wi) => (
              <span key={wi} className="word inline-block mr-[0.22em] last:mr-0 whitespace-nowrap">
                {w.split("").map((ch, ci) => (
                  <span key={ci} className="ch inline-block will-change-transform">
                    {ch}
                  </span>
                ))}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="hero-foot relative z-10 mt-16 md:mt-20 flex flex-col md:flex-row md:items-end md:justify-between gap-10">
        <div className="hero-sub-wrap max-w-3xl md:flex-1 will-change-[filter,opacity]">
          <p
            className="hero-sub text-bone/70"
            style={{ fontSize: "var(--text-body-lg)", lineHeight: 1.4 }}
          >
            .КУРСОР — студия дизайна и разработки. Превращаем амбициозные идеи
            в сильные бренды и цифровые продукты.
          </p>
        </div>
        <div className="hero-meta flex gap-10 label text-steel shrink-0">
          <span>Est. 2025</span>
          <span>Тюмень / Remote</span>
          <span className="text-signal glow-signal">● На связи</span>
        </div>
      </div>

      <div className="hero-scroll absolute left-1/2 -translate-x-1/2 bottom-6 label text-steel flex flex-col items-center gap-3">
        <span>Скролл</span>
        <span className="block h-10 w-px bg-steel/40 animate-pulse" />
      </div>
    </section>
  );
}
