"use client";

import { useState } from "react";

/** Click-to-copy email with animated feedback. */
export default function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      /* clipboard unavailable — fall through, still show feedback */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button onClick={copy} data-cursor className="group text-left cursor-pointer">
      <span
        className={`text-xl md:text-2xl font-normal tracking-[-0.02em] transition-colors ${
          copied ? "text-signal" : "group-hover:text-signal"
        }`}
      >
        {email}
      </span>
      <span
        className={`block label mt-2 transition-colors ${
          copied ? "text-signal" : "text-steel"
        }`}
      >
        {copied ? "Скопировано ✓" : "Клик — скопировать"}
      </span>
    </button>
  );
}
