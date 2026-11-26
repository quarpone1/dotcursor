import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Footer from "@/components/Footer";
import IntegrationDiagram from "./IntegrationDiagram";
import Logo from "@/components/Logo";
import DocumentDemo from "./DocumentDemo";
import EffectCalculator from "./EffectCalculator";
import { HeroVisual, PresentationMotion } from "./Motion";
import Roadmap from "./Roadmap";
import { IndustryScenarios, ProcessComparison } from "./Scenarios";
import styles from "./presentation.module.css";

const title = "AI для операционных процессов — .КУРСОР";
const description = "Анализируем процессы, создаём AI-помощников и подключаем их к вашим системам. Интерактивная демонстрация и калькулятор экономии времени.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/services/ai-processes" },
  openGraph: {
    title,
    description,
    url: "/services/ai-processes",
    images: ["/og.png"],
    locale: "ru_RU",
    type: "website",
  },
};

const approach = [
  ["MIND", "Разбираем процесс", "Находим повторный ввод, задержки и разрывы между системами. Фиксируем картину «как есть»."],
  ["ART", "Проектируем работу", "Показываем, где помогает AI, кто работает с исключениями и что подтверждает сотрудник."],
  ["CRAFT", "Создаём и встраиваем", "Запускаем отдельного помощника или подключаем его к вашим системам. Проверяем эффект на реальном потоке."],
];

const presentationLinks = [
  ["#approach", "Команда"],
  ["#demo", "Демонстрация"],
  ["#cases", "Сценарии"],
  ["#effect", "Калькулятор"],
  ["#roadmap", "Этапы"],
];

export default function AIProcessesPage() {
  return (
    <>
      <main className={styles.page} id="top">
        <PresentationMotion />
        <section className={styles.hero} aria-labelledby="ai-heading">
          <HeroVisual />
          <div className={`${styles.wrap} ${styles.heroWrap}`}>
            <div className={styles.heroCopy}>
              <Link className={styles.breadcrumb} href="/#services">← Услуги студии</Link>
              <p className={styles.kicker}>AI для операционных процессов</p>
              <h1 id="ai-heading">Процессы.<br /><em>Умнее.</em></h1>
              <p className={styles.heroLead}>Помощники берут рутину на себя. Ваша команда проверяет данные и принимает решения.</p>
              <div className={styles.heroActions}>
                <a className={styles.primary} href="#demo">Смотреть в действии<span aria-hidden="true">↘</span></a>
                <a className={styles.secondary} href="#contact">Обсудить процесс<span aria-hidden="true">↗</span></a>
              </div>
            </div>
            <nav className={styles.presentationNav} aria-label="Разделы презентации">
              {presentationLinks.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
            </nav>
          </div>
        </section>

        <section className={styles.section} id="approach" aria-labelledby="approach-heading">
          <div className={styles.wrap}>
            <div className={styles.aboutTop}>
              <header className={styles.heading} data-ai-reveal>
                <p className={styles.kicker}>О команде</p>
                <h2 id="approach-heading">Сначала бизнес.<br />Потом решение.</h2>
                <p>.КУРСОР — команда дизайна и ИТ-разработки. Разбираемся, как устроены процессы, проектируем интерфейсы и доводим сервисы до запуска.</p>
              </header>
              <a className={styles.logoLink} href="https://dotcursor.ru/" target="_blank" rel="noopener noreferrer"
                aria-label=".КУРСОР — больше о студии и наших работах, в новой вкладке">
                <span className={styles.logoArrow} aria-hidden="true">↗</span>
                <span className={styles.wordmark} data-ai-reveal><Logo /></span>
                <span>Больше о студии и наших работах</span>
              </a>
            </div>
            <div className={styles.approach}>
              {approach.map(([step, name, details]) => (
                <article key={step}>
                  <p className={styles.kicker}>{step}</p>
                  <h3>{name}</h3>
                  <p>{details}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <ProcessComparison />
        <DocumentDemo />
        <IndustryScenarios />

        <section className={styles.industry} aria-labelledby="industry-heading">
          <Image src="/ai-processes/weighbridge.webp" alt="Мусоровоз на автомобильных весах у сортировочного комплекса"
            fill sizes="100vw" />
          <div className={styles.wrap}>
            <h2 id="industry-heading">За каждым рейсом<br />стоят данные</h2>
          </div>
        </section>

        <section className={styles.section} id="integration" aria-labelledby="integration-heading">
          <div className={`${styles.wrap} ${styles.integration}`}>
            <div>
              <header className={styles.heading} data-ai-reveal>
                <p className={styles.kicker}>Варианты внедрения</p>
                <h2 id="integration-heading">Отдельный сервис или часть вашей системы</h2>
              </header>
              <dl className={styles.integrationOptions}>
                <div><dt>Отдельный сервис</dt><dd>Бот или веб-интерфейс принимает файлы и готовит реестр для проверки.</dd></div>
                <div><dt>Интеграция в действующий процесс</dt><dd>Сотрудники работают в привычной системе. Обмен данными идёт через API или согласованные форматы.</dd></div>
              </dl>
              <p className={styles.note}>Подключение зависит от доступных интерфейсов, качества данных и прав доступа.</p>
            </div>
            <IntegrationDiagram />
          </div>
        </section>

        <EffectCalculator />
        <Roadmap />
      </main>
      <Footer />
    </>
  );
}
