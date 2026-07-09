"use client";

import { useRef } from "react";
import { useGSAP, prefersReducedMotion } from "@/lib/gsap";

/**
 * Dependency-free WebGL background — domain-warped FBM noise flowing in
 * deep navy → black with signal-blue glints. Caps DPR and pauses when
 * offscreen; falls back to nothing (CSS handles it) on no-WebGL / reduced motion.
 */
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

vec2 hash(vec2 p){
  p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(dot(hash(i+vec2(0.0,0.0)), f-vec2(0.0,0.0)),
                 dot(hash(i+vec2(1.0,0.0)), f-vec2(1.0,0.0)), u.x),
             mix(dot(hash(i+vec2(0.0,1.0)), f-vec2(0.0,1.0)),
                 dot(hash(i+vec2(1.0,1.0)), f-vec2(1.0,1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * 2.4; p.x *= u_res.x / u_res.y;
  // noise field drifts slightly toward the cursor (parallax feel)
  p += (u_mouse - 0.5) * 0.4;
  float t = u_time * 0.05;
  float w = fbm(p * 1.4 - vec2(t, t*0.6));
  float n = fbm(p + vec2(t*0.8, t*0.4) + w * 0.9);

  vec3 c0 = vec3(0.0);
  vec3 c1 = vec3(0.015, 0.04, 0.13);
  vec3 c2 = vec3(0.18, 0.36, 1.0);
  vec3 col = mix(c0, c1, smoothstep(-0.1, 0.6, n + 0.3));
  col = mix(col, c2, smoothstep(0.5, 0.95, n + 0.2) * 0.45);

  // soft glow following the cursor
  float md = distance(uv, u_mouse);
  col += c2 * 0.3 * smoothstep(0.45, 0.0, md) * (0.35 + 0.65 * n);

  col *= 1.0 - 0.55 * length(uv - 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

export default function LiquidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    // smoothed cursor position (normalized, y flipped for GL)
    let tx = 0.5, ty = 0.5, mx = 0.5, my = 0.5;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = 1 - (e.clientY - r.top) / r.height;
    };
    window.addEventListener("pointermove", onMove);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };

    let raf = 0;
    let running = true;
    const start = performance.now();
    const loop = () => {
      if (!running) return;
      resize();
      mx += (tx - mx) * 0.05;
      my += (ty - my) * 0.05;
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    loop();

    // pause when hero scrolled offscreen
    const io = new IntersectionObserver(
      ([e]) => {
        running = e.isIntersecting;
        if (running && !raf) loop();
        else cancelAnimationFrame(raf), (raf = 0);
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  });

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
