"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { HairlineScanner, useReducedMotion } from "./Motion";
import flow from "./flow.module.css";

const destinations = [
  { label: "Реестр", via: "Файл", detail: "Сотрудник получает таблицу проверенных рейсов. Из каждой строки можно открыть исходный документ.", path: "M270 258V269Q270 281 258 281H103Q90 281 90 294V312" },
  { label: "1С / учёт", via: "Обмен", detail: "После подтверждения реквизиты рейса и масса передаются в учётную систему через согласованный формат обмена.", path: "M270 258V312" },
  { label: "CRM", via: "API", detail: "Карточка обращения получает статус, ответственного и ссылку на документы через доступный интерфейс CRM.", path: "M270 258V269Q270 281 282 281H437Q450 281 450 294V312" },
];
const inputs = [
  "M135 48V72Q135 84 149 84H223Q239 84 239 100V116",
  "M405 48V72Q405 84 391 84H317Q301 84 301 100V116",
];
const gatePath = "M270 172V234";

export default function IntegrationDiagram() {
  const [active, setActive] = useState(0);
  const scope = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useGSAP(() => {
    if (reduced || !scope.current) return;
    const timeline = gsap.timeline({ scrollTrigger: { trigger: scope.current, start: "top 85%", once: true } });
    timeline.fromTo("[data-incoming]", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.46, stagger: 0.08, ease: "power1.inOut" })
      .from("[data-core]", { scale: 0.97, duration: 0.24 }, "-=0.12")
      .fromTo("[data-gate-line]", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.22 })
      .fromTo("[data-outgoing]", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 0.46, ease: "power1.inOut" })
      .from("[data-route-detail]", { y: 4, duration: 0.2 }, "-=0.16");
  }, { scope, dependencies: [active, reduced], revertOnUpdate: true });

  return (
    <figure className={flow.integrationFigure} ref={scope}>
      <figcaption>Куда передать результат?</figcaption>
      <div className={flow.diagram}>
        <svg className={flow.wires} viewBox="0 0 540 348" preserveAspectRatio="none" aria-hidden="true">
          {[...inputs, gatePath, ...destinations.map((item) => item.path)].map((d) => <path key={d} d={d} className={flow.wireBase} />)}
          {inputs.map((d) => <path key={d} d={d} className={flow.inputWire} pathLength="1" strokeDasharray="1 1" data-incoming />)}
          <path d={gatePath} className={flow.outputWire} pathLength="1" strokeDasharray="1 1" data-gate-line />
          <path d={destinations[active].path} className={flow.outputWire} pathLength="1" strokeDasharray="1 1" data-outgoing />
        </svg>
        <div className={flow.sources}>
          <div><strong>Файлы и почта</strong><small>Фото · PDF · письма</small></div>
          <div><strong>Диспетчерская</strong><small>Рейсы · статусы</small></div>
        </div>
        <div className={flow.core}>
          <div className={flow.coreNode} data-core>
            <div className={flow.coreScanner} aria-hidden="true"><HairlineScanner /></div>
            <div><strong>AI-помощник</strong><small>Извлечение и сверка</small></div>
          </div>
        </div>
        <div className={flow.gate}><span aria-hidden="true">✓</span> Проверка сотрудником</div>
        <div className={flow.outputs} role="group" aria-label="Выберите систему для передачи результата">
          {destinations.map(({ label, via }, i) => (
            <button key={label} type="button" aria-pressed={active === i} onClick={() => setActive(i)}>
              <strong>{label}</strong><small>{via}</small>
            </button>
          ))}
        </div>
      </div>
      <p className={flow.routeDetail} data-route-detail aria-live="polite">{destinations[active].detail}</p>
    </figure>
  );
}
