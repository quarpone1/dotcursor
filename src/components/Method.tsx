"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import SplitReveal from "./SplitReveal";

const pillars = [
  {
    key: "MIND",
    tag: "разбор",
    text: "Рынок, аудитория, конкуренты, экономика решения. Позиционирование и отличие, которое можно доказать, а не почувствовать.",
  },
  {
    key: "ART",
    tag: "форма",
    text: "Стратегия, переведённая в то, что видно и хочется: фирменный стиль, интерфейсы, движение, 3D.",
  },
  {
    key: "CRAFT",
    tag: "воплощение",
    text: "Вёрстка, анимации, интеграции, печать. Никаких «передадим подрядчику» — доводим до запуска сами.",
  },
];

export default function Method() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".method-pillar", {
        opacity: 0,
        y: 44,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: ".method-grid", start: "top 80%" },
      });
    },
    { scope: ref }
  );

  return (
    <section id="method" ref={ref} className="bg-ink text-bone px-shell section-y">
      <p className="label text-steel mb-16">[ 00.5 — Метод ]</p>

      <SplitReveal as="h2" className="h1 max-w-[16ch]">
        ART &amp; MIND. Одна команда вместо семи подрядчиков.
      </SplitReveal>

      <p className="mt-12 max-w-2xl text-bone/60 text-lg md:text-xl leading-relaxed">
        Обычно бизнес нанимает стратега, копирайтера, дизайнера, верстальщика
        и разработчика — и сам сшивает их между собой. У нас это один процесс,
        одна ответственность и один результат.
      </p>

      {/* три опоры */}
      <div className="method-grid mt-24 grid grid-cols-1 md:grid-cols-3 border-t border-bone/10">
        {pillars.map((p) => (
          <div
            key={p.key}
            className="method-pillar border-b md:border-b-0 md:border-r last:border-r-0 border-bone/10 py-10 md:py-12 md:px-8 first:md:pl-0"
          >
            <div className="flex items-baseline gap-4">
              <span className="text-4xl md:text-5xl font-normal tracking-[-0.03em] text-signal">
                {p.key}
              </span>
              <span className="label text-steel">— {p.tag}</span>
            </div>
            <p className="text-bone/55 mt-6 leading-relaxed">{p.text}</p>
          </div>
        ))}
      </div>

      {/* замыкающая фраза */}
      <p className="mt-24 max-w-3xl text-2xl md:text-4xl font-normal tracking-[-0.02em] leading-[1.15]">
        Красота без расчёта — это украшение. Расчёт без красоты — это таблица.{" "}
        <span className="text-signal">
          Бренд рождается там, где они встречаются.
        </span>
      </p>
    </section>
  );
}
