"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import SplitReveal from "./SplitReveal";
import Odometer from "./Odometer";

const stats = [
  { value: 12, suffix: "+", label: "Проектов в портфолио" },
  { value: 3, suffix: "", label: "Проекта в работе прямо сейчас" },
  { value: 8, suffix: "", label: "Отраслей — от авто до ритейла" },
];

const scramble = ["БРЕНДЫ", "СИСТЕМЫ", "СМЫСЛЫ", "ОПЫТ", "БУДУЩЕЕ"];

const steps = [
  { n: "01", title: "Разбор", desc: "Два часа интервью — и мы уходим работать. Изучаем рынок, конкурентов, аудиторию и цифры бизнеса. На выходе — не пожелания, а стратегия." },
  { n: "02", title: "Концепция", desc: "Стратегия, ориентиры, направление визуала." },
  { n: "03", title: "Дизайн", desc: "Айдентика и макеты до пиксельной точности." },
  { n: "04", title: "Разработка", desc: "Вёрстка, анимации, интеграции, тесты." },
  { n: "05", title: "Запуск", desc: "Релиз, аналитика, поддержка и развитие." },
];

export default function Stats() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      // process steps reveal
      gsap.from(".step-row", {
        opacity: 0,
        y: 40,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: ".step-list", start: "top 82%" },
      });

      // scramble cycling word
      const word = ref.current!.querySelector(".scramble-word") as HTMLElement;
      ScrollTrigger.create({
        trigger: ref.current,
        start: "top 70%",
        once: true,
        onEnter: () => {
          let i = 0;
          const cycle = () => {
            gsap.to(word, {
              duration: 1,
              scrambleText: {
                text: scramble[i % scramble.length],
                chars: "АБВГДЕЖЗИКЛМНОПРСТУФ",
                speed: 0.4,
              },
              onComplete: () => {
                i++;
                gsap.delayedCall(1.4, cycle);
              },
            });
          };
          cycle();
        },
      });
    },
    { scope: ref }
  );

  return (
    <section
      id="stats"
      ref={ref}
      className="bg-ink text-bone px-shell section-y"
    >
      <p className="label text-steel mb-16">[ 03 — Подход ]</p>

      <SplitReveal
        as="h2"
        className="h2 max-w-[14ch]"
      >
        Мы не делаем сайты. Мы строим
      </SplitReveal>
      <span className="scramble-word block h2 text-shimmer-signal glow-signal">
        БРЕНДЫ
      </span>

      <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-12 border-t border-bone/10 pt-12">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-[14vw] md:text-[6vw] font-normal leading-none tracking-[-0.04em] flex items-end">
              <Odometer value={s.value} />
              <span className="text-signal glow-signal">{s.suffix}</span>
            </div>
            <p className="label text-steel mt-6">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Как мы работаем — закрывает пустое пространство секции */}
      <div className="mt-24">
        <p className="label text-steel mb-12">Как мы работаем</p>
        <div className="step-list grid grid-cols-1 md:grid-cols-5 border-t border-bone/10">
          {steps.map((st) => (
            <div
              key={st.n}
              className="step-row border-b md:border-b-0 md:border-r last:border-r-0 border-bone/10 py-10 md:py-8 md:px-6 first:md:pl-0"
            >
              <span className="text-3xl md:text-4xl font-normal tracking-[-0.03em] text-signal">
                {st.n}
              </span>
              <h4 className="text-xl md:text-2xl font-normal tracking-[-0.02em] mt-4">
                {st.title}
              </h4>
              <p className="text-bone/50 text-sm leading-relaxed mt-3">
                {st.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
