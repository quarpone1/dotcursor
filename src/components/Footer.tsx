"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import GlitchText from "./GlitchText";
import Logo from "./Logo";
import Clock from "./Clock";
import CopyEmail from "./CopyEmail";

export default function Footer() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      // giant logo rises + de-masks as the footer comes into view
      gsap.fromTo(
        ".footer-mark",
        { yPercent: 30, opacity: 0.15 },
        {
          yPercent: 0,
          opacity: 1,
          ease: "kursor-out",
          scrollTrigger: {
            trigger: ".footer-mark",
            start: "top 95%",
            end: "bottom bottom",
            scrub: 1,
          },
        }
      );
    },
    { scope: ref }
  );

  return (
    <footer
      ref={ref}
      id="contact"
      className="bg-ink text-bone px-shell pt-[clamp(4rem,8vw,8.5rem)] pb-8 border-t border-bone/10 overflow-hidden"
    >
      <p className="label text-steel mb-16">[ 05 — Контакт ]</p>

      <GlitchText as="h2" className="display">
        Давайте
      </GlitchText>
      <a
        href="mailto:cursordot@yandex.ru"
        data-cursor
        className="display text-shimmer-signal glow-signal hover:opacity-80 transition-opacity inline-block"
      >
        поговорим
      </a>

      {/* contact rows */}
      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-10 border-t border-bone/10 pt-12">
        <div>
          <p className="label text-steel mb-4">Почта</p>
          <CopyEmail email="cursordot@yandex.ru" />
        </div>
        <div>
          <p className="label text-steel mb-4">Соцсети</p>
          <div className="flex flex-col gap-1 text-xl md:text-2xl font-normal tracking-[-0.02em] items-start">
            <a
              href="https://t.me/CURSOR_ARTandMIND"
              target="_blank"
              rel="noopener noreferrer"
              className="roll"
            >
              <span className="roll-inner">
                <span>Telegram</span>
                <span aria-hidden="true" className="text-signal">Telegram</span>
              </span>
            </a>
          </div>
        </div>
        <div>
          <p className="label text-steel mb-4">Локация</p>
          <p className="text-xl md:text-2xl font-normal tracking-[-0.02em] label-none">
            <Clock />
          </p>
          <p className="label text-steel mt-2">Remote по миру</p>
        </div>
      </div>

      {/* giant kinetic wordmark */}
      <div className="mt-24 md:mt-32">
        <Logo className="footer-mark w-full h-auto text-bone/90" />
      </div>

      <div className="mt-10 label text-steel/50 flex flex-col md:flex-row gap-2 md:justify-between">
        <span>© {new Date().getFullYear()} .КУРСОР — Все права защищены</span>
        <span>Новый класс цифрового искусства</span>
      </div>
    </footer>
  );
}
