"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";

export type Project = {
  n: string;
  title: string;
  tag: string;
  year: string;
  color: string;
  link: string;
  image: string;
};

/** Project card with cursor-driven 3D tilt + inner parallax. */
export default function ProjectCard({ p }: { p: Project }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const el = ref.current!;
      const card = el.querySelector(".pc-card") as HTMLElement;
      const inner = el.querySelector(".pc-inner") as HTMLElement;

      const rx = gsap.quickTo(card, "rotationX", { duration: 0.6, ease: "power3" });
      const ry = gsap.quickTo(card, "rotationY", { duration: 0.6, ease: "power3" });
      const px = gsap.quickTo(inner, "x", { duration: 0.7, ease: "power3" });
      const py = gsap.quickTo(inner, "y", { duration: 0.7, ease: "power3" });

      const move = (e: PointerEvent) => {
        const r = card.getBoundingClientRect();
        const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        rx(-ny * 6);
        ry(nx * 6);
        px(nx * 14);
        py(ny * 14);
      };
      const reset = () => {
        rx(0); ry(0); px(0); py(0);
      };

      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", reset);
      return () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerleave", reset);
      };
    },
    { scope: ref }
  );

  return (
    <a
      ref={ref}
      href={p.link}
      target="_blank"
      rel="noopener noreferrer"
      data-cursor="view"
      className="group w-full md:w-[40vw] shrink-0 px-shell md:px-8"
      style={{ perspective: "1000px" }}
    >
      <div
        className="pc-card sheen relative aspect-[16/10] md:aspect-[4/5] rounded-card overflow-hidden flex items-end p-6 md:p-8"
        style={{
          background: `linear-gradient(160deg, ${p.color}22, #0a0a0a)`,
          transformStyle: "preserve-3d",
        }}
      >
        {/* обложка проекта */}
        <Image
          src={p.image}
          alt={p.title}
          fill
          sizes="(min-width: 768px) 40vw, 100vw"
          className="object-cover transition-transform duration-700 group-hover:scale-[1.06]"
        />
        {/* градиент для читаемости текста поверх фото */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/15 to-transparent" />
        <span
          className="absolute top-6 right-6 text-[10vw] md:text-[6vw] font-normal leading-none opacity-40 mix-blend-screen"
          style={{ color: p.color }}
        >
          {p.n}
        </span>
        <div className="pc-inner" style={{ transform: "translateZ(40px)" }}>
          <h3 className="text-3xl md:text-4xl font-normal tracking-[-0.03em] flex items-center gap-3">
            {p.title}
            <span className="text-signal opacity-0 -translate-x-2 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-0">
              ↗
            </span>
          </h3>
          <p className="label text-steel mt-3">
            {p.tag} — {p.year}
          </p>
        </div>
      </div>
    </a>
  );
}
