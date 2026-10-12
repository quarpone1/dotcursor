import type { Metadata } from "next";
import Footer from "@/components/Footer";
import MagneticButton from "@/components/MagneticButton";
import Marquee from "@/components/Marquee";
import Reveal from "@/components/Reveal";
import ScrollText from "@/components/ScrollText";
import LabelDemo from "./LabelDemo";

const TITLE = "Shelf Dataset — синтетические датасеты магазинных полок для YOLO";
const DESCRIPTION =
  "Аддон для Blender: собирает стеллаж, расставляет ваши 3D-модели товаров и рендерит кадры с готовой разметкой YOLO и COCO. Без ручной разметки.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/shelf-dataset" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/shelf-dataset",
    images: ["/shelf-dataset/og.jpg"],
    type: "website",
    locale: "ru_RU",
  },
  twitter: { card: "summary_large_image", images: ["/shelf-dataset/og.jpg"] },
};

const MAIL = "cursordot@yandex.ru";
const TELEGRAM = "https://t.me/CURSOR_ARTandMIND";
const mailto = (subject: string) => `mailto:${MAIL}?subject=${encodeURIComponent(subject)}`;

const facts = [
  { value: "1 кнопка", text: "от папки с моделями до папок train / val / test и data.yaml" },
  { value: "0 часов", text: "ручной разметки: рамки берутся прямо из 3D-сцены" },
  { value: "≈ 1 кадр/с", text: "на EEVEE на современном ноутбуке; Cycles — когда нужны точные тени" },
];

const features = [
  {
    title: "Каждый кадр — новая выкладка",
    text: "Фейсинги, ряды в глубину, ярусы, пустые места «нет в наличии», поредевшие колонки, ракурсы камеры и крупные планы полок.",
  },
  {
    title: "Магазинный свет без брака",
    text: "Шесть схем освещения, границы цветовой температуры и яркости. Пересвеченные и тёмные кадры рендерятся заново.",
  },
  {
    title: "Магазин вокруг стеллажа",
    text: "Плиточный пол, соседние стеллажи, ценники и мягкие тени от потолочного света — вместо стерильной пустоты.",
  },
  {
    title: "Каталог как вам удобно",
    text: "Папка с моделями — и каждая модель становится классом. Или таблица со штрихкодами, чтобы зафиксировать список и порядок классов.",
  },
  {
    title: "Воспроизводимо",
    text: "Тот же пресет, модели и seed дают те же картинки и ту же разметку. Прерванный прогон продолжается с места остановки.",
  },
  {
    title: "Запуск из терминала",
    text: "blender --command shelf_dataset dataset … — для рендер-машин и задач по расписанию.",
  },
];

const steps = [
  { n: "01", title: "Укажите папку с моделями", text: "glb, gltf, blend, fbx, obj, usd, stl или ply в реальном масштабе. Нет моделей — начните с демо-сцены." },
  { n: "02", title: "Задайте число кадров", text: "И доли train / val / test. Стеллаж, свет и окружение настраиваются в той же панели или берутся из пресета." },
  { n: "03", title: "Нажмите «Сгенерировать датасет»", text: "Аддон расставит товары, отрендерит кадры и запишет разметку. Папку можно сразу отдавать в обучение." },
];

const plans = [
  {
    name: "Indie",
    price: "4 900 ₽",
    who: "Один специалист",
    items: ["1 рабочее место", "Все возможности аддона", "Обновления версии 1.x", "Поддержка по почте"],
  },
  {
    name: "Studio",
    price: "14 900 ₽",
    who: "Команда до 5 мест",
    items: ["До 5 рабочих мест", "Все возможности аддона", "Обновления версии 1.x", "Поддержка по почте и в Telegram"],
    accent: true,
  },
  {
    name: "Enterprise",
    price: "39 900 ₽",
    who: "Компания без ограничения мест",
    items: ["Без ограничения мест", "Приоритетная поддержка", "Счёт и договор", "Помощь с первым датасетом"],
  },
];

const faq = [
  {
    q: "Что нужно для работы?",
    a: "Blender 4.2 или новее на Windows, macOS или Linux. Дополнительные пакеты Python не нужны. Аддон ставится одним zip-файлом.",
  },
  {
    q: "У нас нет 3D-моделей товаров. Что делать?",
    a: "Попробовать можно на демо-сцене с шестью товарами вымышленных марок и на встроенном генераторе простых коробок. Модели ваших товаров по фото упаковки мы делаем как услугу.",
  },
  {
    q: "Какая разметка на выходе?",
    a: "Рамки в форматах YOLO и COCO, по желанию — JSON кадра с 3D-координатами, проходы глубины и индекса объекта. Масок сегментации и ключевых точек в этой версии нет.",
  },
  {
    q: "Можно ли использовать датасеты в коммерческих проектах?",
    a: "Да. Всё, что вы отрендерили, — ваше. Код аддона распространяется под GPL-3.0-or-later; демо-товары и фоны можно использовать в своих датасетах, но нельзя перепродавать как ассеты.",
  },
  {
    q: "Как проходит покупка?",
    a: "Напишите нам на почту или в Telegram — пришлём реквизиты для оплаты, чек и архив с аддоном и документацией. Компаниям выставляем счёт и подписываем договор.",
  },
];

const gallery = ["01", "02", "03", "05", "06", "07", "08"];

const pill =
  "sheen label rounded-full px-6 py-3 transition-colors border";

export default function ShelfDataset() {
  return (
    <main className="bg-ink text-bone">
      {/* hero */}
      <section className="relative px-shell pt-[clamp(8rem,14vw,13rem)] pb-[clamp(3rem,6vw,6rem)] overflow-hidden">
        <div
          aria-hidden="true"
          className="glow-orb pointer-events-none absolute -top-40 right-[-10%] w-[60vw] h-[60vw]"
        />
        <p className="label text-steel mb-12 relative">[ Продукт — аддон для Blender ]</p>
        <h1 className="display relative">
          Shelf <span className="text-shimmer-signal glow-signal">Dataset</span>
        </h1>
        <p className="mt-10 max-w-2xl text-bone/70 text-xl md:text-2xl leading-snug relative">
          Размеченный датасет магазинных полок — одной кнопкой. Ваши 3D-модели
          товаров превращаются в тысячи кадров с готовой разметкой YOLO.
        </p>

        <div className="mt-12 flex flex-wrap items-center gap-4 relative">
          <MagneticButton href="#pricing" className={`${pill} bg-bone text-ink border-bone hover:bg-signal hover:border-signal hover:text-bone`}>
            Купить — от 4 900 ₽
          </MagneticButton>
          <MagneticButton href="#video" className={`${pill} border-bone/40 hover:bg-bone hover:text-ink`}>
            Смотреть ролик
          </MagneticButton>
        </div>

        <ul className="mt-16 flex flex-wrap gap-x-10 gap-y-3 label text-steel border-t border-bone/10 pt-8 relative">
          <li>Blender 4.2+</li>
          <li>Windows · macOS · Linux</li>
          <li>YOLO · COCO</li>
          <li>Русский · English</li>
          <li className="text-signal">● Версия 1.1.0</li>
        </ul>
      </section>

      {/* video */}
      <section id="video" className="px-shell pb-[clamp(4rem,8vw,8.5rem)]">
        <Reveal>
          <video
            className="w-full rounded-[var(--radius-card)] border border-bone/10"
            src="/shelf-dataset/promo.mp4"
            poster="/shelf-dataset/cover.jpg"
            controls
            muted
            playsInline
            preload="none"
          />
        </Reveal>
      </section>

      {/* why */}
      <section className="px-shell section-y border-t border-bone/10">
        <p className="label text-steel mb-16">[ 01 — Зачем ]</p>
        <ScrollText className="h1 max-w-[22ch]">
          Тысячу фото полок можно размечать вручную неделями. А можно отрендерить за вечер — уже с разметкой.
        </ScrollText>
        <Reveal className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-bone/10 pt-12">
          {facts.map((f) => (
            <div key={f.value}>
              <p className="h2 text-signal">{f.value}</p>
              <p className="text-bone/60 mt-5 text-lg leading-relaxed max-w-xs">{f.text}</p>
            </div>
          ))}
        </Reveal>
      </section>

      <Marquee items={["YOLO", "COCO", "EEVEE", "CYCLES", "TRAIN / VAL / TEST", "ШТРИХКОДЫ", "SEED", "CLI"]} />

      {/* gallery */}
      <section className="section-y">
        <div className="px-shell">
          <p className="label text-steel mb-16">[ 02 — Кадры ]</p>
          <h2 className="h1 max-w-[18ch]">Выкладка, свет и ракурс меняются сами</h2>
          <p className="mt-8 max-w-2xl text-bone/60 text-lg leading-relaxed">
            Кадры ниже — из демо-набора, который входит в комплект. Товары
            вымышленных марок, без чужих логотипов.
          </p>
        </div>
        <div className="mt-14 flex gap-4 overflow-x-auto px-shell pb-4 snap-x" data-lenis-prevent>
          {gallery.map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={n}
              src={`/shelf-dataset/frame_${n}.jpg`}
              alt={`Кадр датасета ${n}`}
              loading="lazy"
              className="snap-start shrink-0 w-[72vw] sm:w-[40vw] lg:w-[24vw] aspect-[3/4] object-cover rounded-[var(--radius-card)]"
            />
          ))}
        </div>
      </section>

      {/* labels */}
      <section className="px-shell section-y border-t border-bone/10">
        <p className="label text-steel mb-16">[ 03 — Разметка ]</p>
        <h2 className="h1 max-w-[16ch] mb-16">
          Рамка на каждом товаре — <span className="text-signal">сразу</span>
        </h2>
        <LabelDemo />
      </section>

      {/* features */}
      <section className="px-shell section-y border-t border-bone/10">
        <p className="label text-steel mb-16">[ 04 — Возможности ]</p>
        <Reveal className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16">
          {features.map((f, i) => (
            <div key={f.title} className="border-t border-bone/10 pt-8">
              <span className="label text-signal">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-2xl md:text-3xl font-normal tracking-[-0.02em] mt-5">{f.title}</h3>
              <p className="text-bone/50 mt-4 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* how */}
      <section className="px-shell section-y border-t border-bone/10">
        <p className="label text-steel mb-16">[ 05 — Как это работает ]</p>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] gap-12 lg:gap-20 items-start">
          <div className="max-h-[80vh] overflow-hidden rounded-[var(--radius-card)] border border-bone/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/shelf-dataset/panel.jpg" alt="Панель Shelf Dataset в Blender" loading="lazy" className="w-full" />
          </div>
          <div>
            <h2 className="h1">
              Панель в Blender, <span className="text-signal">без кода</span>
            </h2>
            <Reveal className="mt-14">
              {steps.map((s) => (
                <div key={s.n} className="flex gap-8 border-t border-bone/10 py-8">
                  <span className="label text-signal pt-2">{s.n}</span>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-normal tracking-[-0.02em]">{s.title}</h3>
                    <p className="text-bone/50 mt-3 leading-relaxed max-w-xl">{s.text}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="px-shell section-y border-t border-bone/10">
        <p className="label text-steel mb-16">[ 06 — Лицензии ]</p>
        <h2 className="h1 max-w-[18ch]">Одна версия. Три лицензии</h2>
        <p className="mt-8 max-w-2xl text-bone/60 text-lg leading-relaxed">
          Возможности одинаковые — различаются число рабочих мест и поддержка.
          Разовая оплата, без подписки.
        </p>
        <Reveal className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`flex flex-col rounded-[var(--radius-card)] border p-8 md:p-10 ${
                p.accent ? "border-signal bg-signal/10" : "border-bone/15"
              }`}
            >
              <p className="label text-steel">{p.name}</p>
              <p className="mt-6 whitespace-nowrap font-normal tracking-[-0.03em] leading-none text-[clamp(2.4rem,3.6vw,3.75rem)]">{p.price}</p>
              <p className="text-bone/60 mt-3">{p.who}</p>
              <ul className="mt-8 mb-10 space-y-3 text-bone/80 border-t border-bone/10 pt-8">
                {p.items.map((it) => (
                  <li key={it} className="flex gap-3">
                    <span className="text-signal">—</span>
                    {it}
                  </li>
                ))}
              </ul>
              <a
                href={mailto(`Shelf Dataset — лицензия ${p.name}`)}
                data-cursor
                className={`${pill} mt-auto text-center ${
                  p.accent
                    ? "bg-signal border-signal text-bone hover:bg-bone hover:border-bone hover:text-ink"
                    : "border-bone/40 hover:bg-bone hover:text-ink"
                }`}
              >
                Купить
              </a>
            </div>
          ))}
        </Reveal>
        <p className="mt-10 text-bone/50 max-w-3xl leading-relaxed">
          Кнопка откроет письмо на {MAIL}. Удобнее в мессенджере —{" "}
          <a href={TELEGRAM} target="_blank" rel="noopener noreferrer" data-cursor className="text-bone underline underline-offset-4 hover:text-signal">
            напишите в Telegram
          </a>
          . После оплаты пришлём чек и архив с аддоном.
        </p>
      </section>

      {/* service */}
      <section className="px-shell section-y border-t border-bone/10">
        <p className="label text-steel mb-16">[ 07 — Под ключ ]</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-end">
          <h2 className="h1 max-w-[14ch]">Нужен готовый датасет, а не инструмент?</h2>
          <div>
            <p className="text-bone/60 text-lg leading-relaxed max-w-xl">
              Сделаем сами: модели ваших товаров по фото упаковки, окружение
              под ваши магазины и датасет нужного объёма — с разметкой и
              проверкой качества.
            </p>
            <MagneticButton
              href={mailto("Датасет под ключ")}
              className={`${pill} mt-10 border-bone/40 hover:bg-bone hover:text-ink`}
            >
              Обсудить задачу
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="px-shell section-y border-t border-bone/10">
        <p className="label text-steel mb-16">[ 08 — Вопросы ]</p>
        <div className="max-w-4xl">
          {faq.map((f) => (
            <details key={f.q} className="group border-t border-bone/10 last:border-b">
              <summary data-cursor className="flex items-center justify-between gap-8 py-7 cursor-pointer list-none text-xl md:text-2xl tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-signal text-3xl leading-none transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="text-bone/60 pb-8 max-w-3xl leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
