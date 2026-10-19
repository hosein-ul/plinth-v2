"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export type ShaderPreset = "mist" | "mesh" | "dither" | "orb" | "silk" | "horizon";
type Rgb = [number, number, number];

const rgb = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time; uniform vec2 u_res; uniform vec2 u_mouse; uniform float u_spot; uniform float u_pixel;
uniform vec3 u_a; uniform vec3 u_b; uniform vec3 u_c; uniform vec3 u_d;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03+vec2(11.7,3.1); a*=0.5; } return v; }
float bayer2(vec2 a){ a=floor(a); return fract(a.x/2.0 + a.y*a.y*0.75); }
float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }
`;

const BODY: Record<ShaderPreset, string> = {
  /* slow bands of colour rolling across a dark base, with a faint cursor spotlight */
  mist: `
void main(){
  vec2 uv = gl_FragCoord.xy / u_res; vec2 p = uv; p.x *= u_res.x / u_res.y;
  float t = u_time * 0.06;
  float warp = fbm(p*1.4 + vec2(t, -t*0.7));
  float y = p.y - 0.5;
  float wave = sin(p.x*2.2 + t*5.0 + warp*3.2)*0.12 + sin(p.x*4.1 - t*3.0 + warp*2.0)*0.05;
  float d1 = y - wave - 0.1;
  float d2 = y - wave*1.4 + 0.24;
  float b1 = exp(-d1*d1*34.0);
  float b2 = exp(-d2*d2*64.0)*0.55;
  vec3 col = u_a;
  col = mix(col, u_b, clamp(b1*0.92 + b2*0.55, 0.0, 1.0));
  col += u_c * pow(b1, 3.0) * 0.42;
  vec2 m = vec2(u_mouse.x*u_res.x/u_res.y, u_mouse.y);
  float s = exp(-dot(p-m, p-m)*9.0) * 0.16 * u_spot;
  col += u_c * s;
  col *= 1.0 - 0.35*smoothstep(0.55, 1.2, length(uv-0.5)*1.4);
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.02;
  gl_FragColor = vec4(col, 1.0);
}`,
  /* soft blobs drifting on Lissajous paths over a flat base (works light or dark) */
  mesh: `
void main(){
  vec2 uv = gl_FragCoord.xy / u_res; vec2 p = uv; p.x *= u_res.x / u_res.y;
  float t = u_time * 0.07; float ar = u_res.x / u_res.y;
  vec2 c1 = vec2(0.22*ar + 0.18*sin(t*1.1), 0.30 + 0.22*cos(t*0.9));
  vec2 c2 = vec2(0.70*ar + 0.20*cos(t*0.8), 0.72 + 0.18*sin(t*1.3));
  vec2 c3 = vec2(0.52*ar + 0.25*sin(t*0.6+2.0), 0.22 + 0.16*cos(t*1.2+1.0));
  vec2 c4 = vec2(0.92*ar + 0.12*cos(t*1.4), 0.42 + 0.25*sin(t*0.7+3.0));
  float w = fbm(p*1.6 + t) * 0.18;
  float g1 = exp(-dot(p-c1, p-c1)*(2.6+w*4.0));
  float g2 = exp(-dot(p-c2, p-c2)*(2.4+w*4.0));
  float g3 = exp(-dot(p-c3, p-c3)*(3.0+w*4.0));
  float g4 = exp(-dot(p-c4, p-c4)*(3.4+w*4.0));
  vec3 col = u_a;
  col = mix(col, u_b, clamp(g1*0.95, 0.0, 1.0));
  col = mix(col, u_c, clamp(g2*0.85, 0.0, 1.0));
  col = mix(col, u_d, clamp(g3*0.8, 0.0, 1.0));
  col = mix(col, u_b, clamp(g4*0.6, 0.0, 1.0));
  col += (hash(gl_FragCoord.xy + fract(u_time*0.5)) - 0.5) * 0.018;
  gl_FragColor = vec4(col, 1.0);
}`,
  /* ordered-dither field: a moving gradient quantised through a Bayer matrix into two colours */
  dither: `
void main(){
  vec2 uv = gl_FragCoord.xy / u_res; float ar = u_res.x / u_res.y;
  float t = u_time * 0.34;
  vec2 q = vec2(uv.x*ar, uv.y);
  float flow = fbm(q*1.7 + vec2(t*0.55, -t*0.38)) ;
  float g = 1.16 - distance(q, vec2(0.74*ar, 0.5)) * 1.2;
  g += 0.20*sin(q.x*3.4 - t*1.7 + flow*3.4) + 0.17*(fbm(q*2.5 + vec2(-t*0.5, t*0.33)) - 0.5);
  vec2 m = vec2(u_mouse.x*ar, u_mouse.y);
  g += exp(-dot(q-m, q-m)*9.0) * 0.30 * u_spot;
  vec2 cell = gl_FragCoord.xy / u_pixel;
  float th = bayer4(cell);
  float on = step(th, clamp(g, 0.0, 1.0));
  vec3 col = mix(u_a, u_b, on);
  gl_FragColor = vec4(col, 1.0);
}`,
  /* a glowing sphere with a turbulent edge and a soft halo, nudged by the cursor */
  orb: `
void main(){
  vec2 uv = gl_FragCoord.xy / u_res; vec2 q = (uv - vec2(0.5)) * vec2(u_res.x/u_res.y, 1.0);
  q -= (u_mouse - 0.5) * vec2(0.05, 0.05) * u_spot;
  float t = u_time * 0.1;
  float r = length(q); float R = 0.3;
  float n = fbm(q*3.2 + vec2(t, t*0.7));
  float edge = r + (n - 0.5) * 0.12;
  float body = smoothstep(R, R - 0.22, edge);
  float halo = exp(-max(edge - R, 0.0) * 5.5) * 0.55;
  float rim = smoothstep(R - 0.05, R, edge) * smoothstep(R + 0.08, R, edge);
  vec3 col = u_a;
  col = mix(col, u_b, halo * 0.55);
  col = mix(col, u_c, body);
  col += u_d * rim * 0.55;
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.02;
  gl_FragColor = vec4(col, 1.0);
}`,
  /* diagonal silk: broad soft bands of colour drifting along one direction, with film grain */
  silk: `
void main(){
  vec2 uv = gl_FragCoord.xy / u_res; float ar = u_res.x / u_res.y; vec2 p = vec2(uv.x*ar, uv.y);
  float t = u_time * 0.045;
  float w = fbm(p*1.3 + vec2(t, -t*0.6)) - 0.5;
  float d = dot(p, normalize(vec2(0.78, -0.62))) * 0.9 + w * 0.9 + t * 0.6;
  float a = 0.5 + 0.5*sin(d*3.1);
  float b = 0.5 + 0.5*sin(d*1.7 + 1.8 + w*2.0);
  vec3 col = mix(u_a, u_b, smoothstep(0.15, 0.85, a));
  col = mix(col, u_c, smoothstep(0.35, 1.0, b) * 0.7);
  col = mix(col, u_d, smoothstep(0.65, 1.0, a*b) * 0.6);
  col += (hash(gl_FragCoord.xy + fract(u_time*0.3)) - 0.5) * 0.045;
  gl_FragColor = vec4(col, 1.0);
}`,
  /* a glowing horizon: a wide arc of light on a dark ground, breathing slowly */
  horizon: `
void main(){
  vec2 uv = gl_FragCoord.xy / u_res; float ar = u_res.x / u_res.y;
  vec2 p = vec2((uv.x-0.5)*ar, uv.y);
  float t = u_time * 0.08;
  vec2 c = vec2(0.62*ar + (u_mouse.x-0.5)*0.05*u_spot, -0.95);
  float R = 1.32 + 0.015*sin(t) + 0.025*(fbm(vec2(p.x*1.4, t))-0.5);
  float d = length(p - c) - R;
  float rim = exp(-d*d*120.0);
  float glow = exp(-max(d,0.0)*3.2) * smoothstep(-1.0, 0.05, d) * 0.4;
  vec3 col = u_a;
  col = mix(col, u_b, clamp(glow, 0.0, 1.0));
  col += u_c * rim * 0.42 + u_d * pow(rim, 5.0) * 0.28;
  col *= 1.0 - 0.25*smoothstep(0.6, 1.3, length(vec2(p.x*0.7, uv.y-0.45)));
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.026;
  gl_FragColor = vec4(col, 1.0);
}`,
};

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

export interface ShaderFieldProps {
  preset: ShaderPreset;
  colors: [string, string, string, string];
  className?: string;
  /** Size of one dither cell in CSS pixels. */
  pixel?: number;
  /** Faint light following the pointer (mist, orb). */
  spotlight?: boolean;
  /** Seconds offset so two fields on a page do not move in step. */
  seed?: number;
  /** Multiplier on the clock; below 1 is calmer. */
  speed?: number;
}

/**
 * A dependency-free WebGL background. One fullscreen triangle, a fragment shader per preset, device pixel ratio capped,
 * paused while off-screen or in a hidden tab, and a single static frame under prefers-reduced-motion.
 * If WebGL is not available the element simply stays empty so the CSS background of the parent shows.
 */
export function ShaderField({ preset, colors, className, pixel = 4, spotlight = true, seed = 0, speed = 1 }: ShaderFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
      if (process.env.NODE_ENV !== "production") console.warn("ShaderField compile:", gl.getShaderInfoLog(s));
      return null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, HEAD + BODY[preset]);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uTime = U("u_time"), uRes = U("u_res"), uMouse = U("u_mouse"), uSpot = U("u_spot"), uPixel = U("u_pixel");
    const cols = colors.map(rgb);
    (["u_a", "u_b", "u_c", "u_d"] as const).forEach((n, i) => gl.uniform3f(U(n), ...cols[i]!));
    gl.uniform1f(uSpot, spotlight ? 1 : 0);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0.6, y: 0.5, tx: 0.6, ty: 0.5 };
    // Phones: render at 1x, at most ~30 fps, and not at all while the page is being scrolled.
    const lite = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
    let lastScroll = 0, lastDraw = 0;
    const onScroll = () => { lastScroll = performance.now(); };
    let dpr = 1;
    const resize = () => {
      dpr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uPixel, Math.max(1, pixel * dpr));
    };
    // The field runs faster while the page is being scrolled fast and settles back when it stops.
    let clock = 14, lastT = 14, lastY = window.scrollY, vel = 0;
    const draw = (t: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;
      const dt = Math.max(0, Math.min(0.1, t - lastT));
      lastT = t;
      const dy = Math.abs(window.scrollY - lastY);
      lastY = window.scrollY;
      vel += ((dt > 0 ? dy / dt : 0) - vel) * 0.12;
      clock += dt * (1 + Math.min(6, vel / 350));
      gl.uniform1f(uTime, clock * speed + seed);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let raf = 0, visible = true, start = performance.now();
    const loop = () => {
      const now = performance.now();
      if (!lite || (now - lastScroll > 140 && now - lastDraw > 32)) { lastDraw = now; draw((now - start) / 1000); }
      raf = requestAnimationFrame(loop);
    };
    const run = () => { if (!raf && visible && !document.hidden && !reduce && !lite) raf = requestAnimationFrame(loop); };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    resize();
    draw(14);
    const ro = new ResizeObserver(() => { resize(); if (reduce || !raf) draw(14); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; visible ? run() : stop(); });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : run());
    document.addEventListener("visibilitychange", onVis);
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      mouse.ty = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    };
    const host = canvas.parentElement ?? canvas;
    if (spotlight) host.addEventListener("pointermove", onMove);
    run();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("scroll", onScroll);
      host.removeEventListener("pointermove", onMove);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [preset, colors, pixel, spotlight, seed, speed]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none block size-full", className)} />;
}
