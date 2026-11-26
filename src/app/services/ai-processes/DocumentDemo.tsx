"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useReducedMotion } from "./Motion";
import styles from "./presentation.module.css";

type Sample = {
  title: string;
  short: string;
  kind: "waybill" | "receipt" | "license" | "registration" | "invoice" | "act";
  fields: [string, string | null][];
};

const documents: Sample[] = [
  {
    title: "Путевой лист", short: "Путевой лист", kind: "waybill",
    fields: [["Номер документа", "ПЛ-ДЕМО-104"], ["Дата", "20.11.2026"], ["Автомобиль", "А 000 АА · демо"], ["Водитель", "Примеров И. Д."], ["Пробег", "128 км"]],
  },
  {
    title: "Талон весовой", short: "Талон весовой", kind: "receipt",
    fields: [["Дата", "20.11.2026"], ["Рейс", "Р-ДЕМО-104"], ["Брутто", "18 240 кг"], ["Тара", "12 100 кг"], ["Нетто", "6 140 кг"]],
  },
  {
    title: "Водительское удостоверение", short: "Водительские права", kind: "license",
    fields: [["ФИО", "Примеров Иван Демович"], ["Номер", "ДЕМО 000104"], ["Категории", "B, C"], ["Срок действия", null]],
  },
  {
    title: "Свидетельство о регистрации ТС", short: "СТС", kind: "registration",
    fields: [["Госномер", "А 000 АА · демо"], ["VIN", "ДЕМО-VIN-00104"], ["Марка и модель", "Демо Транспорт 04"], ["Номер СТС", "ДЕМО 000218"]],
  },
  {
    title: "Транспортная накладная", short: "Накладная", kind: "invoice",
    fields: [["Номер", "ТН-ДЕМО-042"], ["Дата", "21.11.2026"], ["Отправитель", "Демо Склад"], ["Получатель", "Демо Площадка"], ["Груз", "Вторсырьё"], ["Масса", "6 140 кг"]],
  },
  {
    title: "Акт оказанных услуг", short: "Акт услуг", kind: "act",
    fields: [["Номер", "А-ДЕМО-018"], ["Период", "Ноябрь 2026"], ["Контрагент", "Демо Перевозчик"], ["Состав услуг", "Вывоз вторсырья"], ["Сумма", "48 000 ₽"]],
  },
];

const cycle = (index: number) => (index + documents.length) % documents.length;
const interval = 8000;

function Paper({ sample, side, revealed }: { sample: Sample; side: "previous" | "active" | "next"; revealed: number }) {
  return (
    <div className={`${styles.paper} ${styles[sample.kind]}`} data-paper={side}>
      <header>
        <span>ДЕМО</span>
        <strong>{sample.title}</strong>
      </header>
      <div className={styles.paperBody}>
        {sample.kind === "license" && (
          <svg className={styles.portrait} viewBox="0 0 40 55">
            <circle cx="20" cy="18" r="8" /><path d="M5 46C5 25 35 25 35 46Z" />
          </svg>
        )}
        <dl>
          {sample.fields.map(([label, value], index) => (
            <div key={label} data-lit={index < revealed || undefined}>
              <dt>{label}</dt><dd>{value ?? "···"}</dd>
            </div>
          ))}
        </dl>
      </div>
      <footer>Вымышленные реквизиты</footer>
      {side === "active" && <i className={styles.scanLine} data-scan-line />}
    </div>
  );
}

export default function DocumentDemo() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const processing = useRef<gsap.core.Timeline | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const [phase, setPhase] = useState<"ready" | "processing" | "done">("ready");
  const [revealed, setRevealed] = useState(0);
  const [manual, setManual] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [visible, setVisible] = useState(false);
  const sample = documents[current];

  useEffect(() => {
    const target = stage.current;
    if (!target) return;
    let onScreen = false;
    const sync = () => setVisible(onScreen && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting && entry.intersectionRatio >= 0.25;
      sync();
    }, { threshold: 0.25 });
    observer.observe(target);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      processing.current?.kill();
    };
  }, []);

  useEffect(() => {
    if (manual || hover || focus || !visible || reduced || phase !== "ready") return;
    const id = window.setTimeout(() => setCurrent((index) => cycle(index + 1)), interval);
    return () => window.clearTimeout(id);
  }, [current, manual, hover, focus, visible, reduced, phase]);

  useEffect(() => {
    if (!reduced || !processing.current) return;
    processing.current.progress(1);
  }, [reduced]);

  useGSAP(() => {
    if (reduced || !stage.current) return;
    const paper = stage.current.querySelector('[data-paper="active"]');
    gsap.fromTo(paper, { x: 20, scale: 0.96, opacity: 0.6 }, {
      x: 0, scale: 1, opacity: 1, duration: 0.38, ease: "power3.out",
    });
  }, { scope: stage, dependencies: [current, reduced], revertOnUpdate: true });

  function select(index: number) {
    setManual(true);
    if (cycle(index) === current) return;
    processing.current?.revert();
    processing.current = null;
    setPhase("ready");
    setRevealed(0);
    setCurrent(cycle(index));
  }

  function onKeys(event: KeyboardEvent<HTMLElement>) {
    const targets: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: documents.length - 1 };
    if (targets[event.key] === undefined) return;
    event.preventDefault();
    select(targets[event.key]);
    if ((event.target as HTMLElement).hasAttribute("data-sample-index")) {
      section.current?.querySelector<HTMLButtonElement>(`[data-sample-index="${cycle(targets[event.key])}"]`)?.focus();
    }
  }

  function swipeStart(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function swipeEnd(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      select(current + (dx < 0 ? 1 : -1));
    }
  }

  function run() {
    if (phase === "processing") return;
    setManual(true);
    processing.current?.revert();
    const line = stage.current?.querySelector<HTMLElement>("[data-scan-line]");
    if (reduced || !line) {
      setRevealed(sample.fields.length);
      setPhase("done");
      return;
    }

    setRevealed(0);
    setPhase("processing");
    const timeline = gsap.timeline({
      onComplete: () => {
        setPhase("done");
        processing.current = null;
      },
    });
    processing.current = timeline;
    timeline.fromTo(line, { top: "6%", opacity: 1 }, {
      top: "96%", opacity: 0.8, duration: 0.78, ease: "power2.inOut",
    });
    timeline.to(line, { opacity: 0, duration: 0.16 });
    sample.fields.forEach((_, index) => {
      timeline.call(() => setRevealed(index + 1), [], 0.72 + index * 0.17);
    });
    timeline.to({}, { duration: 0.12 });
  }

  return (
    <section
      id="demo" className={`${styles.section} ${styles.demo}`} ref={section} aria-labelledby="demo-heading"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHover(true); }}
      onPointerLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
    >
      <div className={styles.wrap}>
        <header className={styles.heading} data-ai-reveal>
          <p className={styles.kicker}>Посмотреть в действии</p>
          <h2 id="demo-heading">От документа к данным</h2>
          <p>Выберите образец и посмотрите, как помощник извлекает поля и готовит их к проверке.</p>
        </header>

        <div className={styles.demoGrid} onKeyDown={onKeys} aria-roledescription="карусель" aria-label="Примеры документов" role="group">
          <div className={styles.carousel}>
            <div ref={stage} className={styles.documentStage} aria-hidden="true" onPointerDown={swipeStart}
              onPointerUp={swipeEnd} onPointerCancel={() => { gesture.current = null; }}>
              <Paper sample={documents[cycle(current - 1)]} side="previous" revealed={0} />
              <Paper key={sample.kind} sample={sample} side="active" revealed={revealed} />
              <Paper sample={documents[cycle(current + 1)]} side="next" revealed={0} />
            </div>
            <div className={styles.carouselNavigation}>
              <button type="button" className={styles.arrow} aria-label="Предыдущий документ" onClick={() => select(current - 1)}>←</button>
              <span className={styles.documentCount}>{current + 1} / {documents.length}</span>
              <button type="button" className={styles.arrow} aria-label="Следующий документ" onClick={() => select(current + 1)}>→</button>
            </div>
            <div className={styles.sampleButtons} aria-label="Выбор документа" role="group">
              {documents.map((doc, index) => (
                <button type="button" key={doc.kind} aria-pressed={current === index} title={doc.title}
                  data-sample-index={index} onClick={() => select(index)}>{doc.short}</button>
              ))}
            </div>
          </div>

          <div className={styles.dataCard}>
            <div className={styles.dataHeading}>
              <p className={styles.kicker}>Извлечённые данные</p>
              <h3>{sample.title}</h3>
            </div>
            <dl className={styles.fieldRows}>
              {sample.fields.map(([label, value], index) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd data-status={index < revealed ? (value ? "filled" : "review") : "waiting"}>
                    {index < revealed ? value ?? "Нужно проверить" : "—"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className={styles.documentStatus} role="status">
              {phase === "done"
                ? "Данные подготовлены. Нужна проверка сотрудника"
                : phase === "processing" ? "Извлекаем поля и проверяем комплектность…" : "Ожидает обработки"}
            </p>
            <button className={styles.primary} type="button" onClick={run} aria-disabled={phase === "processing"}>
              {phase === "done" ? "Повторить обработку" : "Показать обработку"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
        <p className={styles.note}>Демонстрация на вымышленных данных. Показывает сценарий работы; реальное распознавание подключается при разработке решения.</p>
      </div>
    </section>
  );
}
