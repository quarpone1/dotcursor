"use client";

import { useId, useRef, useState } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useReducedMotion } from "./Motion";
import styles from "./presentation.module.css";

const workdays = 22;
const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const parameters = [
  { key: "volume", label: "Документов в день", min: 1, max: 500, unit: "" },
  { key: "manual", label: "Обработка вручную", min: 1, max: 60, unit: "мин" },
  { key: "assisted", label: "С помощником, включая проверку", min: 1, max: 60, unit: "мин" },
] as const;

export default function EffectCalculator() {
  const id = useId();
  const [{ volume, manual, assisted }, setValues] = useState({ volume: 100, manual: 8, assisted: 3 });
  const arc = useRef<SVGCircleElement>(null);
  const reduced = useReducedMotion();
  const saving = Math.max(0, manual - assisted);
  const hours = format.format(volume * saving * workdays / 60);
  const values = { volume, manual, assisted };

  useGSAP(() => {
    const element = arc.current;
    if (!element) return;
    const offset = 100 - 100 * saving / manual;
    const tween = gsap.to(element, {
      attr: { "stroke-dashoffset": offset },
      duration: reduced ? 0 : 0.28,
      ease: "power2.out",
      overwrite: true,
    });
    return () => { tween.kill(); };
  }, { dependencies: [manual, saving, reduced] });

  return (
    <section id="effect" className={`${styles.section} ${styles.effect}`} aria-labelledby="effect-heading">
      <div className={styles.wrap}>
        <header className={styles.heading} data-ai-reveal>
          <p className={styles.kicker}>Калькулятор времени</p>
          <h2 id="effect-heading">Эффект, который можно посчитать</h2>
        </header>
        <div className={styles.calculator}>
          <div className={styles.sliders}>
            {parameters.map(({ key, label, min, max, unit }) => (
              <div key={key} className={styles.slider}>
                <div>
                  <label htmlFor={`${id}-${key}`}>{label}</label>
                  <span className={styles.sliderValue}>{format.format(values[key])} {unit && <small>{unit}</small>}</span>
                </div>
                <input
                  id={`${id}-${key}`}
                  type="range" min={min} max={max} value={values[key]}
                  aria-valuetext={unit ? `${values[key]} минут на документ` : String(values[key])}
                  onChange={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    setValues((previous) => ({ ...previous, [key]: value }));
                  }}
                />
                {unit && <small>На один документ</small>}
              </div>
            ))}
          </div>
          <div className={styles.calcResult} aria-live="polite" aria-atomic="true">
            <div className={styles.chart}>
              <svg viewBox="0 0 240 240" aria-hidden="true">
                <circle cx="120" cy="120" r="112" className={styles.chartGuide} />
                <circle cx="120" cy="120" r="98" className={styles.chartBase} />
                <circle cx="120" cy="120" r="98" className={styles.chartSaving} ref={arc}
                  pathLength="100" strokeDasharray="100" strokeDashoffset="37.5" transform="rotate(-90 120 120)" />
                <circle cx="120" cy="120" r="84" className={styles.chartGuide} />
              </svg>
              <div><strong>{saving} <small>мин</small></strong><span>экономии на документе</span></div>
            </div>
            <div className={styles.chartDetail}>
              <p>Исходное время <strong>{manual} мин</strong></p>
              <p><i className={styles.remainingKey} /> С помощником <strong>{assisted} мин</strong></p>
              <p><i className={styles.savingKey} /> Экономия <strong>{saving} мин</strong></p>
              <div className={styles.monthly}>
                <strong>{hours} <small>ч в месяц</small></strong>
                <span>{saving > 0 ? "можно направить на другие задачи" : "При этих параметрах экономии времени нет"}</span>
              </div>
            </div>
          </div>
          <p className={styles.formula}>
            {format.format(volume)} док. × {saving} мин экономии × {workdays} рабочих дня / 60
          </p>
        </div>
        <p className={styles.note}>Иллюстративный расчёт. Фактическое время измеряем на пилоте. Денежный эффект оцениваем с учётом стоимости разработки, эксплуатации и контроля.</p>
      </div>
    </section>
  );
}
