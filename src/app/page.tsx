import Hero from "@/components/Hero";
import BgVideoSection from "@/components/BgVideoSection";
import Marquee from "@/components/Marquee";
import Method from "@/components/Method";
import Services from "@/components/Services";
import Projects from "@/components/Projects";
import Statement from "@/components/Statement";
import Stats from "@/components/Stats";
import Clients from "@/components/Clients";
import Footer from "@/components/Footer";
import ScrollText from "@/components/ScrollText";
import Reveal from "@/components/Reveal";

const principles = [
  {
    n: "01",
    title: "Сначала разум, потом искусство",
    text: "Каждый проект начинается с разбора бизнеса, рынка и покупателя. Стратегия, позиционирование, обещание бренда — до первого пикселя.",
  },
  {
    n: "02",
    title: "Смысл прежде формы",
    text: "Сначала задача бизнеса, и только потом эстетика. Красиво — это следствие, а не цель.",
  },
  {
    n: "03",
    title: "Внимание к деталям",
    text: "Каждый отступ, шрифт и анимация выверены вручную.",
  },
  {
    n: "04",
    title: "Живые интерфейсы",
    text: "Движение — не украшение, а способ вести человека к решению.",
  },
];

export default function Home() {
  return (
    <main>
      <Hero />

      {/* editorial statement + manifesto */}
      <section id="about" className="bg-ink text-bone px-shell section-y">
        <p className="label text-steel mb-16">[ 00 — Студия ]</p>
        <ScrollText className="display max-w-[20ch]">
          Мы не оформляем бизнес. Мы его сначала понимаем — и только потом рисуем.
        </ScrollText>
        <p className="mt-12 max-w-2xl text-bone/60 text-lg md:text-xl leading-relaxed">
          .КУРСОР — студия дизайна и разработки. Создаём бренды и цифровые
          продукты, которые меняют то, как вас видят.
        </p>

        <Reveal className="mt-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 border-t border-bone/10 pt-12">
          {principles.map((p) => (
            <div key={p.n}>
              <span className="label text-signal">{p.n}</span>
              <h3 className="text-2xl md:text-3xl font-normal tracking-[-0.02em] mt-5">
                {p.title}
              </h3>
              <p className="text-bone/50 mt-4 leading-relaxed">
                {p.text}
              </p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* [ 00.5 — Метод ] */}
      <Method />

      {/* scroll-driven background video */}
      <BgVideoSection />

      <Services />

      <Marquee
        items={["СТРАТЕГИЯ", "БРЕНДИНГ", "АЙДЕНТИКА", "ВЕБ-ДИЗАЙН", "РАЗРАБОТКА", "ПОЛИГРАФИЯ", "МОУШН", "AI-АГЕНТЫ"]}
      />

      <Projects />
      <Statement />
      <Stats />
      <Clients />
      <Footer />
    </main>
  );
}
