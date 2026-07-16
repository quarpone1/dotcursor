"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import GlitchText from "./GlitchText";

const services = [
  { n: "01", title: "Стратегия и аналитика", desc: "Разбор бизнеса, рынка и аудитории. Позиционирование, отличие от конкурентов, миссия и ценности, тексты." },
  { n: "02", title: "Брендинг", desc: "Стратегия, платформа бренда, нейминг и характер коммуникации." },
  { n: "03", title: "Айдентика", desc: "Логотип, фирменный стиль, гайдлайны, носители." },
  { n: "04", title: "Веб-дизайн", desc: "Лендинги, сайты, интерфейсы — от концепции до прототипа." },
  { n: "05", title: "Разработка", desc: "Next.js, анимации на GSAP, интеграции, поддержка." },
  { n: "06", title: "Полиграфия", desc: "Упаковка, этикетки, печатные материалы премиум-уровня." },
  { n: "07", title: "Моушн", desc: "Анимация, видео, motion-айдентика для соцсетей и сайта." },
];

export default function Services() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.from(".srv-row", {
        opacity: 0,
        y: 40,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
        scrollTrigger: { trigger: ".srv-list", start: "top 80%" },
      });
    },
    { scope: ref }
  );

  return (
    <section id="services" ref={ref} className="bg-ink text-bone px-shell section-y">
      <p className="label text-steel mb-16">[ 01 — Услуги ]</p>

      <GlitchText as="h2" className="h1 mb-12 md:mb-16">
        Что мы умеем
      </GlitchText>

      <div className="srv-list border-t border-bone/10">
        {services.map((s) => (
          <div
            key={s.n}
            data-cursor
            className="srv-row group relative flex items-baseline gap-6 md:gap-12 border-b border-bone/10 py-7 md:py-9 cursor-default transition-colors"
          >
            <span className="label text-steel w-10 shrink-0">{s.n}</span>
            <h3 className="text-4xl md:text-6xl font-normal tracking-[-0.03em] transition-transform duration-500 group-hover:translate-x-3 group-hover:text-signal">
              {s.title}
            </h3>
            <p className="ml-auto hidden md:block max-w-xs text-right text-bone/50 text-base opacity-0 -translate-x-3 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-0">
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
