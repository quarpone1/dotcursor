"use client";

import { useRef } from "react";
import { useGSAP, prefersReducedMotion } from "@/lib/gsap";

/**
 * Canvas ribbon that trails the cursor — a tapering signal-blue line that
 * fades as the pointer slows. Desktop / fine-pointer only.
 */
export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useGSAP(() => {
    if (!window.matchMedia("(pointer: fine)").matches || prefersReducedMotion())
      return;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    const MAX = 20;
    const points: { x: number; y: number }[] = [];
    let cx = -100,
      cy = -100,
      active = false;

    const move = (e: PointerEvent) => {
      cx = e.clientX;
      cy = e.clientY;
      active = true;
    };
    window.addEventListener("pointermove", move);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (active) points.push({ x: cx, y: cy });
      while (points.length > MAX) points.shift();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (points.length < 2) return;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < points.length; i++) {
        const t = i / points.length;
        ctx.beginPath();
        ctx.moveTo(points[i - 1].x * dpr, points[i - 1].y * dpr);
        ctx.lineTo(points[i].x * dpr, points[i].y * dpr);
        ctx.lineWidth = t * 3 * dpr;
        ctx.strokeStyle = `rgba(47, 93, 255, ${t * 0.55})`;
        ctx.stroke();
      }
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    };
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-[9998] pointer-events-none mix-blend-screen"
    />
  );
}
