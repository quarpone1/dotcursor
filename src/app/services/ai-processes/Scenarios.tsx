"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useReducedMotion } from "./Motion";
import { assistedMinutes, manualMinutes } from "./timeExample";
import styles from "./presentation.module.css";
import flow from "./flow.module.css";

const phases = [
  {
    name: "Сбор", manual: "Собрать по частям", assisted: "Принять одним пакетом",
    before: "Диспетчер ищет фото путевого листа в чате, а талон весовой — в почте.",
    after: "Водитель отправляет файлы в один канал. Помощник связывает их с рейсом и запрашивает пропуски.",
  },
  {
    name: "Сверка", manual: "Перенести и сверить", assisted: "Проверить исключения",
    before: "Сотрудник перепечатывает реквизиты и сверяет каждый талон с журналом рейсов.",
    after: "Помощник извлекает поля и показывает расхождения рядом с оригиналом. Сотрудник принимает решение.",
  },
  {
    name: "Передача", manual: "Заполнить реестр", assisted: "Подтвердить запись",
    before: "Диспетчер вручную собирает итоговую строку и переносит её в учётную систему.",
    after: "После подтверждения готовая запись уходит в реестр вместе со ссылками на исходные документы.",
  },
];

const cases = [
  {
    name: "Документы водителя", title: "Что пропущено в пакете рейса?",
    description: "Помощник собирает фото и сканы в карточку рейса. Водитель сразу видит, какой документ нужно дослать.",
    flow: ["Водитель", "Проверка пакета", "Реестр рейсов"],
    exhibit: "Пакет рейса № 104", value: "2 из 3", unit: "документов получено",
    rows: [["Путевой лист", "Получен"], ["Весовой талон", "Получен"], ["Акт приёмки", "Запросить"]],
    next: "Запрос водителю", signal: "Пока нет акта, пакет остаётся открытым.",
    measure: "Комплектность пакета и время до закрытия рейса.",
  },
  {
    name: "Сверка с весовой", title: "Где разошлась масса груза?",
    description: "Помощник находит пару по рейсу и машине, сопоставляет массу нетто и отдаёт расхождение диспетчеру вместе с талоном.",
    flow: ["Весовая", "Сверка по рейсу", "Диспетчер"],
    exhibit: "Сверка рейса № 104", value: "130 кг", unit: "расхождение по массе",
    rows: [["Талон весовой", "6 140 кг"], ["Реестр рейсов", "6 010 кг"], ["Разница", "+130 кг"]],
    next: "Проверить запись", signal: "Уточнить массу до закрытия периода.",
    measure: "Время сверки и доля записей без пары.",
  },
  {
    name: "Обращения жителей", title: "Куда направить обращение?",
    description: "Помощник уточняет адрес и тему. Диспетчер получает заявку с историей переписки и может сразу назначить выезд.",
    flow: ["Житель", "Привязка к адресу", "Заявка на вывоз"],
    exhibit: "История обращения", value: "1 заявка", unit: "из трёх сообщений",
    rows: [["09:41 · Житель", "Нет вывоза"], ["09:42 · Помощник", "Уточнил адрес"], ["09:45 · Диспетчер", "Принял заявку"]],
    next: "Назначить выезд", signal: "Адрес и переписка собраны в одной карточке.",
    measure: "Время первого ответа и число повторных обращений.",
  },
  {
    name: "Работа диспетчера", title: "Какой рейс требует внимания?",
    description: "Помощник сопоставляет график с отметками машин и выносит задержки в очередь проверки. Приоритет и действия выбирает диспетчер.",
    flow: ["План вывоза", "Отклонение", "Решение диспетчера"],
    exhibit: "Прибытие на площадку", value: "+18 мин", unit: "к плановому времени",
    rows: [["План рейса № 104", "10:20"], ["Отметка прибытия", "10:38"], ["Отклонение", "18 минут"]],
    next: "Уточнить причину", signal: "Опоздавший рейс попадает в очередь диспетчера.",
    measure: "Время обнаружения задержки и число просроченных заявок.",
  },
  {
    name: "Акты и отчётность", title: "Какая строка задерживает акт?",
    description: "Помощник собирает проект акта из проверенного реестра. У каждой позиции виден первичный документ или причина, по которой нужна проверка.",
    flow: ["Реестр", "Проект акта", "Утверждение"],
    exhibit: "Подготовка акта", value: "1 строка", unit: "требует первичного документа",
    rows: [["Рейс № 102", "Есть источник"], ["Рейс № 103", "Есть источник"], ["Рейс № 104", "Нет талона"]],
    next: "Запросить талон", signal: "Ответственный видит, что мешает утвердить акт.",
    measure: "Время подготовки акта и количество ручных правок.",
  },
];

function DocumentRoute({ assisted }: { assisted: boolean }) {
  const branches = assisted
    ? ["M24 17H47Q56 17 64 28L77 47Q84 56 95 56H115", "M24 56H115", "M24 95H47Q56 95 64 84L77 65Q84 56 95 56H115"]
    : ["M24 17H68V37H96V56H115", "M24 56H52V73H82V56H115", "M24 95H96V78H112"];
  return (
    <svg className={flow.routeSketch} viewBox="0 0 210 112" aria-hidden="true">
      {branches.map((d) => <path d={d} key={d} className={flow.branch} />)}
      {assisted ? <path d="M138 56H181" /> : <path d="M138 56H153V24H170Q177 24 177 31V49Q177 56 184 56M154 72V88H126V69" />}
      <g className={flow.routePulse}>
        <path d={branches[0]} pathLength="1" strokeDasharray="1" data-document-trace />
      </g>
      {[17, 56, 95].map((y) => (
        <g key={y} transform={`translate(6 ${y - 11})`} className={flow.symbol}>
          <path d="M2 0H12L18 6V22H2ZM12 0V7H18M6 12H14M6 16H13" />
        </g>
      ))}
      <rect x="113" y="43" width="25" height="26" rx="6" className={flow.symbol} />
      {assisted ? <path d="M118 55L124 61L133 50" /> : <path d="M119 60L120 55L128 47L132 51L124 59ZM120 64H132" />}
      <g className={flow.symbol}>
        <rect x="184" y="45" width="23" height="23" rx="3" />
        <path d="M184 53H207M192 53V68M197 58H202M197 63H202" />
      </g>
    </svg>
  );
}

export function ProcessComparison() {
  const [active, setActive] = useState(1);
  const scope = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(() => {
    if (reduced) return;
    gsap.fromTo("[data-document-trace]", { attr: { "stroke-dashoffset": 1 } }, {
      attr: { "stroke-dashoffset": 0 }, duration: 0.85, stagger: 0.09, ease: "power2.inOut",
      scrollTrigger: { trigger: scope.current, start: "top 92%", once: true },
    });
    gsap.from("[data-phase-detail]", { y: 5, opacity: 0.45, duration: 0.32, ease: "power2.out" });
    gsap.fromTo("[data-phase-pip]", { scale: 0.7 }, { scale: 1, duration: 0.36, ease: "back.out(1.6)" });
  }, { scope, dependencies: [active, reduced], revertOnUpdate: true });

  return (
    <section className={`${styles.section} ${styles.process}`} id="process" aria-labelledby="process-heading">
      <div className={styles.wrap}>
        <header className={styles.heading} data-ai-reveal>
          <p className={styles.kicker}>Процесс крупным планом</p>
          <h2 id="process-heading">Как меняется работа команды</h2>
          <p>Проследите путь одного документа — от сообщения водителя до записи в реестре.</p>
        </header>
        <div ref={scope} className={flow.comparison}>
          <div className={flow.compareHead}>
            <p>Обработка документа <small>Пример для одного рейса</small></p>
            <div className={flow.phasePicker} role="group" aria-label="Этап обработки">
              {phases.map(({ name }, i) => <button key={name} type="button" aria-pressed={i === active} onClick={() => setActive(i)}>{name}</button>)}
            </div>
          </div>
          <div className={flow.lanes}>
            {(["manual", "assisted"] as const).map((mode) => {
              const isAssisted = mode === "assisted";
              return (
                <article key={mode} className={flow.lane} data-assisted={isAssisted}>
                  <h3><i aria-hidden="true" />{isAssisted ? "С помощником" : "Как есть"}</h3>
                  <div className={flow.laneSummary}>
                    <div>
                      <div className={flow.duration}><strong>{isAssisted ? assistedMinutes : manualMinutes}</strong> мин</div>
                      <p className={flow.laneCaption}>времени сотрудника</p>
                    </div>
                    <DocumentRoute assisted={isAssisted} />
                  </div>
                  <div className={flow.ticks} aria-hidden="true">
                    {Array.from({ length: manualMinutes }, (_, i) => <i key={i} data-filled={!isAssisted || i < assistedMinutes} />)}
                  </div>
                  <ol className={flow.stationList} role="list">
                    {phases.map((phase, i) => (
                      <li key={phase.name} data-current={i === active}>
                        <span aria-hidden="true" data-phase-pip={i === active ? "" : undefined}>{i + 1}</span>{phase[mode]}
                      </li>
                    ))}
                  </ol>
                  <p className={flow.laneDetail} data-phase-detail aria-live="polite">{isAssisted ? phases[active].after : phases[active].before}</p>
                </article>
              );
            })}
          </div>
          <div className={flow.compareFoot}><strong>−{manualMinutes - assistedMinutes} мин</strong><span>на документ в этом примере. Фактическое время проверяем на пилоте.</span></div>
        </div>
      </div>
    </section>
  );
}

export function IndustryScenarios() {
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const selected = cases[active];

  useEffect(() => {
    const track = tabs.current;
    const pill = indicator.current;
    const tab = track?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!track || !pill || !tab) return;

    // DesignBookmark Tab Pill: the leading edge arrives before the trailing edge.
    const place = () => {
      const left = tab.offsetLeft;
      const right = track.clientWidth - left - tab.offsetWidth;
      const top = tab.offsetTop;
      const changedRow = top !== pill.offsetTop;
      const slide = !reduced && !changedRow && pill.style.opacity === "1";
      const forward = left > pill.offsetLeft;
      gsap.set(pill, { top, height: tab.offsetHeight, opacity: 1 });
      gsap.to(pill, { left, duration: slide ? (forward ? 0.38 : 0.22) : 0, ease: "power3.out", overwrite: "auto" });
      gsap.to(pill, { right, duration: slide ? (forward ? 0.22 : 0.38) : 0, ease: "power3.out", overwrite: "auto" });
    };
    let previous = "";
    const update = () => {
      const bounds = [track.clientWidth, tab.offsetLeft, tab.offsetTop, tab.offsetHeight, tab.offsetWidth].join(",");
      if (bounds === previous) return;
      previous = bounds;
      place();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    observer.observe(tab);
    return () => {
      observer.disconnect();
      gsap.killTweensOf(pill);
    };
  }, [active, reduced]);

  useGSAP(() => {
    if (reduced) return;
    gsap.from("[data-case-row]", { y: 7, opacity: 0.3, duration: 0.28, stagger: 0.045, ease: "power2.out" });
  }, { scope: panel, dependencies: [active, reduced], revertOnUpdate: true });

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const count = cases.length;
    const map: Record<string, number> = { ArrowRight: (active + 1) % count, ArrowLeft: (active + count - 1) % count, Home: 0, End: count - 1 };
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
        <div className={flow.caseTabs} role="tablist" aria-label="Отраслевые сценарии" ref={tabs} onKeyDown={move}>
          <span ref={indicator} className={flow.tabPill} aria-hidden="true" />
          {cases.map(({ name }, index) => (
            <button key={name} type="button" id={`ai-case-${index}`} role="tab" aria-selected={active === index}
              aria-controls="ai-case-panel" tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)}>{name}</button>
          ))}
        </div>
        <div ref={panel} className={flow.casePanel} id="ai-case-panel" role="tabpanel" aria-labelledby={`ai-case-${active}`} tabIndex={0}>
          <div className={flow.caseCopy}>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
            <ol className={flow.caseRoute} role="list">{selected.flow.map((step) => <li key={step}>{step}</li>)}</ol>
            <p className={flow.measure}><strong>На пилоте измеряем</strong>{selected.measure}</p>
          </div>
          <figure className={flow.evidence}>
            <figcaption><span>{selected.exhibit}</span><small>Пример</small></figcaption>
            <div className={flow.caseStat} data-case-row><strong>{selected.value}</strong><span>{selected.unit}</span></div>
            <dl>{selected.rows.map(([label, value], i) => <div key={label} data-case-row><dt>{label}</dt><dd data-flag={i === 2 && active !== 2}>{value}</dd></div>)}</dl>
            <div className={flow.caseAction} data-case-row><strong>{selected.next}</strong><span>{selected.signal}</span></div>
          </figure>
        </div>
      </div>
    </section>
  );
}
