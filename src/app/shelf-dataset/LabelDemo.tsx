"use client";

import { useState } from "react";
import data from "./labels.json";

const COLORS = ["#ff5a4f", "#2f5dff", "#39d98a", "#ffc542", "#b678ff", "#ff7ac0"];
const NAMES_RU: Record<string, string> = {
  beef_325: "Говядина 325 г",
  cream_500: "Сливки 500 г",
  juice_200: "Сок 200 мл",
  kefir_930: "Кефир 930 г",
  milk_1l: "Молоко 1 л",
  shake_200: "Коктейль 200 г",
};

const boxes = data.boxes as number[][];

/** One rendered frame with its YOLO boxes; classes can be switched off. */
export default function LabelDemo() {
  const [on, setOn] = useState(true);
  const [hidden, setHidden] = useState<number[]>([]);

  const toggle = (c: number) =>
    setHidden((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c]));
  const visible = boxes.filter(([c]) => !hidden.includes(c)).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-12 lg:gap-20 items-start">
      <div className="relative overflow-hidden rounded-[var(--radius-card)] aspect-[3/4] bg-micro">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/shelf-dataset/frame_04.jpg"
          alt="Кадр датасета: стеллаж с товарами"
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        {boxes.map(([c, x, y, w, h], i) => (
          <span
            key={i}
            className="absolute transition-opacity duration-300"
            style={{
              left: `${(x - w / 2) * 100}%`,
              top: `${(y - h / 2) * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              border: `2px solid ${COLORS[c % COLORS.length]}`,
              background: `${COLORS[c % COLORS.length]}22`,
              opacity: on && !hidden.includes(c) ? 1 : 0,
              transitionDelay: on ? `${(y * 400) | 0}ms` : "0ms",
            }}
          />
        ))}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setOn((v) => !v)}
          data-cursor
          aria-pressed={on}
          className="sheen label border border-bone/40 rounded-full px-5 py-2.5 hover:bg-bone hover:text-ink transition-colors"
        >
          {on ? "Скрыть разметку" : "Показать разметку"}
        </button>

        <p className="label text-steel mt-10">
          Рамок в кадре:{" "}
          <span className="text-bone tabular-nums">{on ? visible : 0}</span>
        </p>

        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 border-t border-bone/10">
          {data.names.map((name, c) => {
            const off = hidden.includes(c);
            return (
              <li key={name} className="border-b border-bone/10">
                <button
                  type="button"
                  onClick={() => toggle(c)}
                  data-cursor
                  aria-pressed={!off}
                  className={`w-full flex items-center gap-4 py-4 text-left text-lg transition-opacity ${
                    off ? "opacity-35" : ""
                  }`}
                >
                  <span className="w-3.5 h-3.5 shrink-0" style={{ background: COLORS[c] }} />
                  {NAMES_RU[name] ?? name}
                  <span className="label text-steel ml-auto tabular-nums">
                    {boxes.filter(([k]) => k === c).length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <pre className="mt-10 font-mono text-sm leading-relaxed text-bone/60 overflow-x-auto">
          {boxes
            .slice(0, 4)
            .map(([c, x, y, w, h]) => `${c} ${x.toFixed(4)} ${y.toFixed(4)} ${w.toFixed(4)} ${h.toFixed(4)}`)
            .join("\n")}
          {"\n…"}
        </pre>
        <p className="label text-steel mt-3">labels/img_0004.txt — формат YOLO</p>
      </div>
    </div>
  );
}
