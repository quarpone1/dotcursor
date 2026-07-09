import Hero from "@/components/Hero";
import BgVideoSection from "@/components/BgVideoSection";
import Marquee from "@/components/Marquee";
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
    title: "Смысл прежде формы",
    text: "Сначала — стратегия и задача бизнеса, и только потом эстетика.",
  },
  {
    n: "02",
    title: "Внимание к деталям",
    text: "Каждый отступ, шрифт и анимация выверены вручную.",
  },
  {
    n: "03",
    title: "Живые интерфейсы",
    text: "Анимация — не украшение, а способ вести пользователя.",
  },
];

export default function Home() {
  return (
    <main>
      <Hero />

      {/* editorial statement + manifesto */}
      <section id="about" className="bg-ink text-bone px-shell section-y">
        <p className="label text-steel mb-16">[ 00 — Студия ]</p>
        <ScrollText className="display max-w-[16ch]">
          Создаём бренды и цифровые продукты, которые меняют то, как вас видят.
        </ScrollText>

        <Reveal className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-bone/10 pt-12">
          {principles.map((p) => (
            <div key={p.n}>
              <span className="label text-signal">{p.n}</span>
              <h3 className="text-2xl md:text-3xl font-normal tracking-[-0.02em] mt-5">
                {p.title}
              </h3>
              <p className="text-bone/50 mt-4 leading-relaxed max-w-xs">
                {p.text}
              </p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* scroll-driven background video */}
      <BgVideoSection />

      <Services />

      <Marquee
        items={["БРЕНДИНГ", "АЙДЕНТИКА", "ВЕБ-ДИЗАЙН", "РАЗРАБОТКА", "ПОЛИГРАФИЯ", "МОУШН"]}
      />

      <Projects />
      <Statement />
      <Stats />
      <Clients />
      <Footer />
    </main>
  );
}
