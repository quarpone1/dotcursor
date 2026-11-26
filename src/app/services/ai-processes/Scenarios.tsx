"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useReducedMotion } from "./Motion";
import styles from "./presentation.module.css";

const processes = [
  {
    label: "Как есть",
    steps: [
      ["Собрать файлы", "Фото и сканы приходят разными сообщениями."],
      ["Перепечатать", "Данные переносят из документа в реестр."],
      ["Сверить", "Рейс, машину и массу сопоставляют вручную."],
      ["Исправить", "Пропуски и расхождения уточняют у водителя."],
      ["Внести в систему", "Сотрудник формирует итоговую запись."],
    ],
  },
  {
    label: "С помощником",
    steps: [
      ["Загрузить пакет", "Файлы попадают в один согласованный канал."],
      ["Распознать поля", "Помощник извлекает данные и сохраняет источник."],
      ["Проверить правила", "Помощник отмечает дубли, пропуски и расхождения."],
      ["Подтвердить", "Сотрудник разбирает исключения и принимает решение."],
      ["Передать данные", "Проверенная запись уходит в реестр или систему."],
    ],
  },
];

const cases = [
  {
    name: "Документы водителя", title: "Комплект документов по каждому рейсу",
    description: "Бот принимает фото путевого листа, талоны и голосовые сообщения. Собирает пакет по рейсу, извлекает реквизиты и уточняет пропуски. Диспетчер получает реестр и список исключений.",
    flow: ["Водитель", "Проверка пакета", "Реестр рейсов"],
    metric: "Измеряем время обработки рейса, комплектность пакета и число исправлений.",
  },
  {
    name: "Сверка с весовой", title: "Расхождения видны до закрытия периода",
    description: "Помощник сопоставляет талоны весовой с реестром рейсов и данными перевозчика. Отмечает дубли, несовпадение массы и записи, для которых не нашлась пара.",
    flow: ["Весовая и реестр", "Сопоставление", "Список расхождений"],
    metric: "Измеряем время сверки и долю несопоставленных записей.",
  },
  {
    name: "Обращения жителей", title: "Из сообщения в заявку",
    description: "Помощник уточняет адрес и тему обращения, создаёт заявку и отвечает по утверждённой базе знаний. Сложные случаи передаёт сотруднику вместе с полной историей.",
    flow: ["Сообщение жителя", "Уточнение и ответ", "Заявка сотруднику"],
    metric: "Измеряем время первого ответа, повторные обращения и передачи человеку.",
  },
  {
    name: "Работа диспетчера", title: "Диспетчер видит, где нужно внимание",
    description: "План вывоза, статусы рейсов и обращения собираются в общую картину. Помощник выделяет отклонения и предлагает приоритет проверки. Дальнейшие действия подтверждает диспетчер.",
    flow: ["План и факт", "Отклонения", "Решение диспетчера"],
    metric: "Измеряем время обнаружения отклонений и число просроченных заявок.",
  },
  {
    name: "Акты и отчётность", title: "У каждой цифры есть источник",
    description: "Помощник готовит проект акта и управленческую сводку по утверждённому шаблону. Использует проверенные реестры, показывает недостающие данные и сохраняет ссылку на первичный документ.",
    flow: ["Проверенные данные", "Шаблон отчёта", "Утверждение"],
    metric: "Измеряем время подготовки отчёта и количество ручных правок.",
  },
];

export function ProcessComparison() {
  const [active, setActive] = useState(0);
  const steps = useRef<HTMLOListElement>(null);
  const reduced = useReducedMotion();

  useGSAP(() => {
    if (!reduced && active !== 0) {
      gsap.from(steps.current?.children ?? [], { y: 8, opacity: 0.5, duration: 0.28, stagger: 0.04 });
    }
  }, { scope: steps, dependencies: [active, reduced], revertOnUpdate: true });

  return (
    <section className={`${styles.section} ${styles.process}`} id="process" aria-labelledby="process-heading">
      <div className={styles.wrap}>
        <header className={styles.heading} data-ai-reveal>
          <p className={styles.kicker}>Процесс крупным планом</p>
          <h2 id="process-heading">Как меняется работа команды</h2>
          <p>Сравните обработку документов рейса в двух режимах.</p>
        </header>
        <div className={styles.segmented} role="group" aria-label="Режим обработки документов">
          {processes.map(({ label }, index) => (
            <button key={label} type="button" aria-pressed={active === index} onClick={() => setActive(index)}>{label}</button>
          ))}
        </div>
        <ol ref={steps} className={styles.processSteps} data-assisted={active === 1} role="list" aria-live="polite">
          {processes[active].steps.map(([title, details], index) => (
            <li key={index}><i aria-hidden="true" /><h3>{title}</h3><p>{details}</p></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function IndustryScenarios() {
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const selected = cases[active];

  useGSAP(() => {
    if (!reduced) gsap.from(panel.current?.children ?? [], { y: 7, duration: 0.28, ease: "power2.out" });
  }, { scope: panel, dependencies: [active, reduced], revertOnUpdate: true });

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const count = cases.length;
    const map: Record<string, number> = {
      ArrowRight: (active + 1) % count,
      ArrowLeft: (active + count - 1) % count,
      Home: 0,
      End: count - 1,
    };
    const next = map[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabs.current?.querySelector<HTMLButtonElement>(`#ai-case-${next}`)?.focus();
  }

  return (
    <section className={styles.section} id="cases" aria-labelledby="cases-heading">
      <div className={styles.wrap}>
        <header className={styles.heading} data-ai-reveal>
          <p className={styles.kicker}>Обращение с отходами</p>
          <h2 id="cases-heading">Пять сценариев для бизнеса</h2>
        </header>
        <div className={styles.caseTabs} role="tablist" aria-label="Отраслевые сценарии" ref={tabs} onKeyDown={move}>
          {cases.map(({ name }, index) => (
            <button key={name} type="button" id={`ai-case-${index}`} role="tab" aria-selected={active === index}
              aria-controls="ai-case-panel" tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)}>
              {name}
            </button>
          ))}
        </div>
        <div className={styles.casePanel} id="ai-case-panel" role="tabpanel" aria-labelledby={`ai-case-${active}`} tabIndex={0} ref={panel}>
          <h3>{selected.title}</h3>
          <p>{selected.description}</p>
          <ol className={styles.caseFlow} role="list">
            {selected.flow.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className={styles.caseMetric}>{selected.metric}</p>
        </div>
      </div>
    </section>
  );
}
