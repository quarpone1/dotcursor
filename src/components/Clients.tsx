"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";

// h — индивидуальная высота: пропорции у логотипов очень разные
// (широкие вордмарки ~3:1 vs квадратные знаки 1:1).
// dark — логотип с тёмной заливкой: осветляем с сохранением оттенков,
// иначе он невидим на чёрном фоне.
const clients = [
  { name: "HAVAL", slug: "haval", h: "h-6 md:h-7" },
  { name: "Сорока", slug: "soroka", h: "h-10 md:h-14", dark: true },
  { name: "Протос", slug: "protos", h: "h-10 md:h-14" },
  { name: "Зерновъ", slug: "zernov", h: "h-10 md:h-14" },
  { name: "Краски Англии", slug: "kraski", h: "h-16 md:h-24" },
  { name: "Кочарян", slug: "kocharyan", h: "h-16 md:h-24", dark: true },
  { name: "Мишель", slug: "michelle", h: "h-16 md:h-24" },
  { name: "ATS", slug: "ats", h: "h-10 md:h-14" },
];

export default function Clients() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".client-cell", {
        opacity: 0,
        y: 24,
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.06,
        scrollTrigger: { trigger: ".client-grid", start: "top 82%" },
      });

      // spotlight follows the cursor inside each cell (CSS vars → gradient)
      ref.current!.querySelectorAll<HTMLElement>(".client-cell").forEach((cell) => {
        cell.addEventListener("pointermove", (e: PointerEvent) => {
          const r = cell.getBoundingClientRect();
          cell.style.setProperty("--mx", `${e.clientX - r.left}px`);
          cell.style.setProperty("--my", `${e.clientY - r.top}px`);
        });
      });
    },
    { scope: ref }
  );

  return (
    <section id="clients" ref={ref} className="bg-ink text-bone px-shell section-y">
      <p className="label text-steel mb-16">[ 04 — Клиенты ]</p>

      <div className="client-grid grid grid-cols-2 md:grid-cols-4 border-t border-l border-bone/10">
        {clients.map((c) => (
          <div
            key={c.slug}
            className="client-cell group flex items-center justify-center border-r border-b border-bone/10 aspect-[3/2] transition-colors hover:bg-micro"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG, no optimization needed */}
            <img
              src={`/clients/${c.slug}.svg`}
              alt={c.name}
              loading="lazy"
              className={`${c.h} w-auto max-w-[70%] opacity-75 transition-opacity duration-500 group-hover:opacity-100`}
              style={
                c.dark
                  ? { filter: "invert(1) hue-rotate(180deg)" }
                  : undefined
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
