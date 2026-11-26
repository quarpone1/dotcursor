"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./presentation.module.css";

const stages = [
  {
    title: "Обследование",
    details: "Общаемся с владельцами процесса, изучаем документы и системы, измеряем ручные операции и задержки.",
    result: "Карта «как есть» и выявленные узкие места.",
  },
  {
    title: "Предложение оптимизации",
    details: "Проектируем «как должно быть», определяем роль помощника и сотрудника, выбираем отдельный сервис или интеграцию.",
    result: "Схема нового процесса и состав решения.",
  },
  {
    title: "Согласование",
    details: "Уточняем объём работ, доступы, ограничения, критерии результата, сроки и стоимость.",
    result: "Согласованный план реализации.",
  },
  {
    title: "Разработка",
    details: "Создаём прототип, проверяем на образцах, дорабатываем сценарии и подключаем необходимые системы.",
    result: "Рабочее решение, проверенное на согласованных примерах.",
  },
  {
    title: "Внедрение",
    details: "Запускаем на потоке, обучаем сотрудников, собираем обратную связь и измеряем эффект.",
    result: "Решение в работе и результаты замеров.",
  },
];

export default function Roadmap() {
  const ref = useRef<HTMLOListElement>(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({
      horizontal: "(min-width: 1080px)",
      vertical: "(max-width: 1079px)",
      motion: "(prefers-reduced-motion: no-preference)",
    }, ({ conditions }) => {
      if (!conditions?.motion || !ref.current) return;
      const desktop = conditions.horizontal;
      const lines = ref.current.querySelectorAll(desktop ? "[data-road-line]" : "[data-road-segment]");
      const nodes = ref.current.querySelectorAll("[data-road-node]");

      lines.forEach((line) => {
        gsap.fromTo(line, desktop ? { scaleX: 0 } : { scaleY: 0 }, {
          scaleX: 1,
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: desktop ? ref.current : line.parentElement,
            start: "top 82%",
            end: desktop ? "top 42%" : "bottom 66%",
            scrub: 0.35,
          },
        });
      });

      nodes.forEach((node, index) => {
        gsap.fromTo(node, { "--node-light": 0 }, {
          "--node-light": 1,
          duration: 0.36,
          delay: desktop ? index * 0.12 : 0,
          scrollTrigger: { trigger: desktop ? ref.current : node, start: "top 77%", once: true },
        });
      });
    });
    return () => media.revert();
  }, { scope: ref });

  return (
    <section className={styles.section} id="roadmap" aria-labelledby="roadmap-heading">
      <div className={styles.wrap}>
        <header className={styles.heading} data-ai-reveal>
          <h2 id="roadmap-heading">От обследования до внедрения</h2>
        </header>
        <ol ref={ref} className={styles.roadmap} role="list">
          {stages.map(({ title, details, result }, index) => (
            <li key={title} className={styles.roadStep}>
              {index === 0 && <span className={styles.roadTrack} aria-hidden="true"><i data-road-line /></span>}
              {index < stages.length - 1 && (
                <span className={styles.roadSegment} aria-hidden="true"><i data-road-segment /></span>
              )}
              <span className={styles.roadNode} data-road-node aria-hidden="true">0{index + 1}</span>
              <div className={styles.roadContent}>
                <h3>{title}</h3>
                <p>{result}</p>
                <details>
                  <summary>Что делаем<span aria-hidden="true">+</span></summary>
                  <p>{details}</p>
                </details>
              </div>
            </li>
          ))}
        </ol>
        <p className={styles.note}>Сроки и стоимость определяем после обследования и согласования объёма работ.</p>
      </div>
    </section>
  );
}
