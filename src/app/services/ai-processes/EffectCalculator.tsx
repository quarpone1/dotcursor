"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useReducedMotion } from "./Motion";
import { assistedMinutes, manualMinutes } from "./timeExample";
import styles from "./presentation.module.css";

const workdays = 22;
const format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const parameters = [
  { key: "volume", label: "Документов в день", min: 1, max: 500, unit: "" },
  { key: "manual", label: "Обработка вручную", min: 1, max: 60, unit: "мин" },
] as const;

export default function EffectCalculator() {
  const id = useId();
  const [{ volume, manual }, setValues] = useState({ volume: 100, manual: manualMinutes });
  const arc = useRef<SVGCircleElement>(null);
  const reduced = useReducedMotion();
  const saving = Math.max(0, manual - assistedMinutes);
  const hours = format.format(volume * saving * workdays / 60);
  const values = { volume, manual };

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
                  style={{ "--fill": `${100 * (values[key] - min) / (max - min)}%` } as CSSProperties}
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
                  pathLength="100" strokeDasharray="100" strokeDashoffset={100 * assistedMinutes / manualMinutes} transform="rotate(-90 120 120)" />
                <circle cx="120" cy="120" r="84" className={styles.chartGuide} />
              </svg>
              <div><strong>{assistedMinutes} <small>мин</small></strong><span>с помощником на документ</span></div>
            </div>
            <div className={styles.chartDetail}>
              <p>Вручную <strong>{manual} мин</strong></p>
              <p><i className={styles.remainingKey} /> С помощником <strong>{assistedMinutes} мин</strong></p>
              <p><i className={styles.savingKey} /> Экономия <strong>{saving} мин</strong></p>
              <div className={styles.monthly}>
                <strong>{hours} <small>ч в месяц</small></strong>
                <span>{saving > 0 ? "можно направить на другие задачи" : "При этих параметрах экономии времени нет"}</span>
              </div>
            </div>
          </div>
        </div>
        <p className={styles.note}>Для примера берём {workdays} рабочих дня в месяце и {assistedMinutes} минуту на документ с помощником, включая проверку сотрудником. Фактическое время измеряем на пилоте.</p>
      </div>
    </section>
  );
}
