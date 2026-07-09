"use client";

import SplitReveal from "./SplitReveal";

/**
 * Light (bone) section — breaks the all-dark rhythm with a high-contrast
 * editorial statement. The custom cursor (mix-blend-difference) stays readable.
 */
export default function Statement() {
  return (
    <section className="bg-bone text-ink px-shell section-y">
      <div className="flex items-start gap-6">
        <span className="label text-ink/40 mt-4 shrink-0">[ ✶ ]</span>
        <SplitReveal as="h2" className="h1 max-w-[18ch]">
          Хороший дизайн незаметен. Великий — меняет восприятие бренда.
        </SplitReveal>
      </div>

      <div className="mt-16 md:mt-24 flex flex-col md:flex-row md:items-end md:justify-between gap-8 border-t border-ink/15 pt-8">
        <p className="max-w-xl text-ink/60" style={{ fontSize: "var(--text-body-lg)", lineHeight: 1.35 }}>
          Соединяем стратегию, эстетику и инженерию, чтобы проект решал задачи
          бизнеса, а не просто радовал глаз.
        </p>
        <span className="label text-ink/40 shrink-0">.КУРСОР — A New Class of Craft</span>
      </div>
    </section>
  );
}
