"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import ProjectCard, { type Project } from "./ProjectCard";
import GlitchText from "./GlitchText";

// Реальные проекты .КУРСОР (из материалов студии)
const projects: Project[] = [
  {
    n: "01",
    title: "Протос",
    image: "/projects/protos.jpg",
    tag: "Холистик-бренд для питомцев",
    year: "2025",
    color: "#2f5dff",
    link: "https://dprofile.ru/case/158237/protos-sozdanie-xolistik-brenda-dlia-pitomcev",
  },
  {
    n: "02",
    title: "Зерновъ",
    image: "/projects/zernov.jpg",
    tag: "Айдентика бренда снеков",
    year: "2025",
    color: "#758696",
    link: "https://dprofile.ru/case/158226/zernovie-sozdanie-aidentiki-dlia-brenda-snekov",
  },
  {
    n: "03",
    title: "Краски Англии",
    image: "/projects/kraski.jpg",
    tag: "Премиум-бренд / Полиграфия",
    year: "2025",
    color: "#f6efe5",
    link: "https://dprofile.ru/case/158229/listovka-dlia-premium-brenda-kraski-anglii",
  },
  {
    n: "04",
    title: "Сорока",
    image: "/projects/soroka.jpg",
    tag: "Детский центр / Бренд",
    year: "2025",
    color: "#1a36ad",
    link: "https://dprofile.ru/case/165346/detskii-centr-soroka",
  },
  {
    n: "05",
    title: "HAVAL",
    image: "/projects/haval.jpg",
    tag: "Автомобильный бренд",
    year: "2025",
    color: "#2f5dff",
    link: "https://dprofile.ru/case/165348/haval",
  },
  {
    n: "06",
    title: "Кочарян",
    image: "/projects/kocharyan.jpg",
    tag: "Сайт сыроварни / Розыгрыш",
    year: "2026",
    color: "#758696",
    link: "https://project21070646.tilda.ws/",
  },
];

export default function Projects() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Horizontal pinned scroll only on desktop. On mobile the section is a
      // natural vertical list (no pin) — far more reliable on touch.
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px)", () => {
        const track = ref.current!.querySelector(".pr-track") as HTMLElement;
        const fill = ref.current!.querySelector(".pr-fill") as HTMLElement;
        const idx = ref.current!.querySelector(".pr-idx") as HTMLElement;
        const total = projects.length;
        const amount = () => track.scrollWidth - window.innerWidth;

        gsap.to(track, {
          x: () => -amount(),
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            start: "top top",
            end: () => "+=" + amount(),
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              gsap.set(fill, { scaleX: self.progress });
              const i = Math.min(total, Math.floor(self.progress * total) + 1);
              idx.textContent = `0${i} / 0${total}`;
            },
          },
        });
      });

      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <section id="work" ref={ref} className="relative bg-ink text-bone overflow-hidden">
      {/* horizontal progress — visible while pinned (desktop) */}
      <div className="hidden md:flex absolute bottom-8 left-1/2 -translate-x-1/2 z-10 items-center gap-5">
        <span className="pr-idx label text-steel tabular-nums">01 / 0{projects.length}</span>
        <div className="h-px w-44 bg-bone/10 overflow-hidden">
          <div className="pr-fill h-full w-full bg-signal origin-left scale-x-0" />
        </div>
      </div>
      <div className="pr-track flex flex-col md:flex-row md:items-center w-full md:w-max md:h-dvh py-24 md:py-0 gap-16 md:gap-0">
        {/* intro panel */}
        <div className="w-full md:w-[55vw] shrink-0 px-shell">
          <p className="label text-steel mb-6">[ 02 — Работы ]</p>
          <GlitchText as="h2" className="h1 max-w-[10ch]">
            Работы, которыми гордимся
          </GlitchText>
          <p className="mt-8 max-w-md text-bone/60 text-lg">
            <span className="md:hidden">Бренды, айдентика и сайты, которые мы спроектировали и собрали.</span>
            <span className="hidden md:inline">Бренды, айдентика и сайты, которые мы спроектировали и собрали. Скролль вправо.</span>
          </p>
        </div>

        {projects.map((p) => (
          <ProjectCard key={p.n} p={p} />
        ))}

        {/* outro */}
        <div className="w-full md:w-[35vw] shrink-0 px-shell flex flex-col justify-center">
          <a
            href="#contact"
            className="h1 hover:text-signal transition-colors"
          >
            Ваш проект →
          </a>
        </div>
      </div>
    </section>
  );
}
