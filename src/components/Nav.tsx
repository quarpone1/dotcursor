"use client";

import { useRef, useState } from "react";
import { gsap, ScrollTrigger, useGSAP } from "@/lib/gsap";
import Logo from "./Logo";
import MagneticButton from "./MagneticButton";

const links = [
  { label: "Студия", href: "#about" },
  { label: "Услуги", href: "#services" },
  { label: "Работы", href: "#work" },
  { label: "Подход", href: "#stats" },
  { label: "Клиенты", href: "#clients" },
  { label: "Контакт", href: "#contact" },
];

type Lenis = { stop: () => void; start: () => void };

export default function Nav() {
  const ref = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useGSAP(
    () => {
      let ready = false;
      gsap.from(ref.current, {
        yPercent: -120,
        duration: 1,
        ease: "power3.out",
        delay: 2.6, // after preloader
        onComplete: () => {
          ready = true;
        },
      });

      // smart bar: hides on scroll down, returns on scroll up
      let navHidden = false;
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          if (!ready) return;
          const shouldHide = self.scroll() > 120 && self.direction === 1;
          if (shouldHide && !navHidden) {
            navHidden = true;
            gsap.to(ref.current, { yPercent: -120, duration: 0.5, ease: "power3.out", overwrite: "auto" });
          } else if (!shouldHide && navHidden) {
            navHidden = false;
            gsap.to(ref.current, { yPercent: 0, duration: 0.5, ease: "power3.out", overwrite: "auto" });
          }
        },
      });

      // animated underline on hover (desktop)
      ref.current!.querySelectorAll<HTMLElement>(".nav-link").forEach((link) => {
        const line = link.querySelector(".nav-underline") as HTMLElement;
        gsap.set(line, { scaleX: 0, transformOrigin: "left center" });
        link.addEventListener("mouseenter", () =>
          gsap.to(line, { scaleX: 1, duration: 0.4, ease: "power3.out" })
        );
        link.addEventListener("mouseleave", () =>
          gsap.to(line, {
            scaleX: 0,
            duration: 0.4,
            ease: "power3.in",
            transformOrigin: "right center",
          })
        );
      });
    },
    { scope: ref }
  );

  // open/close the fullscreen mobile menu
  const toggle = (next: boolean) => {
    const lenis = (window as unknown as { lenis?: Lenis }).lenis;
    setOpen(next);
    if (next) {
      lenis?.stop();
      gsap.set(menuRef.current, { display: "flex" });
      gsap.fromTo(
        menuRef.current,
        { clipPath: "inset(0 0 100% 0)" },
        { clipPath: "inset(0 0 0% 0)", duration: 0.6, ease: "power3.inOut" }
      );
      gsap.fromTo(
        ".m-link",
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.06, delay: 0.2, ease: "power3.out" }
      );
    } else {
      lenis?.start();
      gsap.to(menuRef.current, {
        clipPath: "inset(0 0 100% 0)",
        duration: 0.5,
        ease: "power3.inOut",
        onComplete: () => gsap.set(menuRef.current, { display: "none" }),
      });
    }
  };

  return (
    <>
      <nav
        ref={ref}
        className="fixed top-0 inset-x-0 z-[900] flex items-center justify-between px-shell py-6 mix-blend-difference text-bone"
      >
        <a href="#top" aria-label=".КУРСОР — на главную" onClick={() => open && toggle(false)}>
          <Logo className="h-5 md:h-6 w-auto" />
        </a>

        {/* desktop links */}
        <ul className="hidden md:flex items-center gap-10 label">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="nav-link relative inline-block py-1">
                <span className="roll">
                  <span className="roll-inner">
                    <span>{l.label}</span>
                    <span aria-hidden="true" className="text-signal">{l.label}</span>
                  </span>
                </span>
                <span className="nav-underline absolute left-0 -bottom-0.5 h-px w-full bg-bone" />
              </a>
            </li>
          ))}
        </ul>

        {/* desktop CTA */}
        <MagneticButton
          href="#contact"
          className="sheen hidden md:inline-block label border border-bone/40 rounded-full px-5 py-2.5 hover:bg-bone hover:text-ink transition-colors"
        >
          Связаться
        </MagneticButton>

        {/* mobile hamburger */}
        <button
          onClick={() => toggle(!open)}
          className="md:hidden flex flex-col gap-[5px] p-2 -mr-2"
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
        >
          <span
            className={`block h-px w-6 bg-bone transition-transform duration-300 ${
              open ? "translate-y-[6px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-px w-6 bg-bone transition-transform duration-300 ${
              open ? "-translate-y-[6px] -rotate-45" : ""
            }`}
          />
        </button>
      </nav>

      {/* fullscreen mobile menu */}
      <div
        ref={menuRef}
        className="fixed inset-0 z-[800] hidden md:!hidden flex-col justify-between bg-ink text-bone px-shell pt-28 pb-10"
        style={{ clipPath: "inset(0 0 100% 0)" }}
      >
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
            <li key={l.href} className="overflow-hidden">
              <a
                href={l.href}
                onClick={() => toggle(false)}
                className="m-link block text-5xl font-normal tracking-[-0.03em] py-2"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="m-link flex items-center justify-between label text-steel">
          <span>hello@kursor.studio</span>
          <span className="text-signal">● На связи</span>
        </div>
      </div>
    </>
  );
}
