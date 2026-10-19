"use client";
import { useEffect, useRef } from "react";
import { TokenIcon } from "@/components/brand";
import type { MotionValue } from "motion/react";
import { useCompact } from "./use-compact";
import { useReduced } from "./use-reduced";

const VERT = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

/* A tunnel of gates seen from a camera that flies forward as `u_z` grows. Each gate is a ring of the same family as the
   product's seam rings; the last one opens onto a mint light (the vault). Pure maths in the fragment shader, no geometry. */
const FRAG = `
precision mediump float;
uniform vec2 u_res; uniform float u_z; uniform float u_t; uniform float u_v; uniform sampler2D u_coin; uniform float u_hasCoin;
float lumH(vec2 q){ vec4 t = texture2D(u_coin, q); return dot(t.rgb, vec3(0.30, 0.59, 0.11)) * t.a; }
float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
// one channel of the gates: thin rings that brighten as they pass the camera
float gates(float r, float shift){
  float depth = 0.34 / (r + 1e-4);
  float k = (depth + u_z * 7.0) * 0.62;
  float f = fract(k);
  return smoothstep(0.075, 0.0, abs(f - 0.5) - 0.015) + smoothstep(0.34, 0.0, abs(f - 0.5)) * 0.22;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  float r = length(uv) + 1e-4;
  float a = atan(uv.y, uv.x);
  float k0 = (0.34 / r + u_z * 7.0) * 0.62;
  float id = floor(k0);
  // colour split grows with flight speed: red and blue read the gates at slightly different radii
  float split = 0.012 * u_v;
  float gr = gates(r * (1.0 - split), 0.0);
  float gg = gates(r, 0.0);
  float gb = gates(r * (1.0 + split), 0.0);
  float sp = 0.5 + 0.5 * cos(a * 14.0 + u_z * 2.6 + id * 0.7);
  float spokes = pow(sp, 18.0) * 0.16;
  vec3 blue = mix(vec3(0.10, 0.23, 0.54), vec3(0.36, 0.55, 0.94), hash(id));
  vec3 mint = vec3(0.07, 0.84, 0.63);
  float arrive = smoothstep(0.78, 1.0, u_z);
  vec3 tint = mix(blue, mint, arrive);
  float fade = smoothstep(0.0, 0.55, r) * (1.0 - smoothstep(1.1, 1.5, r) * 0.6);
  vec3 col = vec3(0.039, 0.063, 0.098);
  col += vec3(gr * tint.r, gg * tint.g, gb * tint.b) * 0.95 * fade;
  col += tint * (spokes + gg * 0.0) * fade;
  // speed lines: thin radial streaks that only exist while the camera is moving
  float lines = pow(hash(floor(a * 70.0) + floor(u_z * 40.0)), 10.0);
  float lineMask = smoothstep(0.08, 0.7, r) * (1.0 - smoothstep(0.7, 1.2, r));
  col += vec3(0.55, 0.72, 1.0) * lines * lineMask * u_v * 1.6;
  // the coin: the real USDC mark, flipping as it flies toward the camera, then a flash as it passes the last gate
  float cp = smoothstep(0.0, 0.8, u_z);
  float rc = mix(0.035, 0.17, cp * cp);
  float ca = 0.0; // the coin is a photograph layered above this canvas (see Statement); the gates, streaks and arrival bloom stay here
  float spin = u_z * 22.0;
  float sx = cos(spin);
  float ax = max(abs(sx), 0.09);
  vec2 cq = vec2(uv.x / ax, uv.y) / rc;
  float e = length(cq);
  float inside = smoothstep(1.0, 0.985, e) * ca;
  vec2 tuv = vec2(sx < 0.0 ? -cq.x : cq.x, cq.y) * 0.5 + 0.5;
  vec4 tex = texture2D(u_coin, tuv);
  float px = 2.5 / 256.0;
  float h0 = lumH(tuv);
  float hx = lumH(tuv + vec2(px, 0.0)) - lumH(tuv - vec2(px, 0.0));
  float hy = lumH(tuv + vec2(0.0, px)) - lumH(tuv - vec2(0.0, px));
  vec3 nrm = normalize(vec3(-hx * 2.4 * u_hasCoin, -hy * 2.4 * u_hasCoin, 1.0));
  float bev = smoothstep(0.84, 0.99, e);
  nrm.xy += (cq / max(e, 1e-3)) * bev * 1.5;
  nrm = normalize(nrm);
  vec3 L = normalize(vec3(cos(u_z * 9.0) * 0.75, 0.62, 0.7));
  vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(nrm, L), 0.0);
  float spec = pow(max(dot(nrm, Hh), 0.0), 70.0);
  vec3 baseCol = mix(vec3(0.153, 0.459, 0.792), tex.rgb, tex.a * u_hasCoin);
  float fres = pow(1.0 - nrm.z, 2.0);
  vec3 envc = mix(vec3(0.04, 0.09, 0.24), vec3(0.72, 0.9, 1.0), smoothstep(-0.5, 0.9, nrm.y * 0.8 + nrm.x * 0.35));
  vec3 coin = baseCol * (0.42 + 0.8 * diff) + spec * vec3(1.0, 0.97, 0.92) * (0.5 + 0.7 * smoothstep(0.55, 0.9, h0)) + envc * fres * 0.9;
  float thin = 1.0 - smoothstep(0.12, 0.7, abs(sx));
  float reeds = 0.75 + 0.25 * sin(uv.y / rc * 90.0);
  coin = mix(coin, vec3(0.62, 0.78, 0.98) * reeds * (0.55 + 0.6 * diff) + spec * 0.5, thin);
  col = mix(col, coin, inside);
  col += vec3(0.35, 0.55, 1.0) * exp(-pow(r / max(rc * 1.6, 0.03), 2.0)) * 0.22 * ca;
  // arrival: a bloom of mint light when the coin goes through the last gate, settling into a steady vault glow
  float flash = smoothstep(0.78, 0.86, u_z) * (1.0 - smoothstep(0.86, 1.0, u_z));
  col += mix(vec3(0.9, 1.0, 0.97), mint, 0.35) * exp(-r * r * 6.0) * flash * 1.3;
  float core = exp(-r * r * 9.0);
  col += mix(vec3(0.16, 0.30, 0.70), mint, arrive) * core * (0.08 + 0.7 * arrive);
  col += (hash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + u_t) - 0.5) * 0.018;
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Camera fly-through. `progress` (0..1) is how far the camera has travelled. Desktop only: phones and reduced motion
 * get a calm still frame, because a full-screen shader tied to scroll is too heavy for a phone main thread.
 */
export function TunnelField({ progress, className }: { progress: MotionValue<number>; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mark = useRef<HTMLSpanElement>(null);
  const compact = useCompact();
  const reduce = useReduced();
  const off = compact || reduce;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || off) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
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
    const uRes = gl.getUniformLocation(prog, "u_res"), uZ = gl.getUniformLocation(prog, "u_z"), uT = gl.getUniformLocation(prog, "u_t"), uV = gl.getUniformLocation(prog, "u_v"), uHas = gl.getUniformLocation(prog, "u_hasCoin");
    gl.uniform1i(gl.getUniformLocation(prog, "u_coin"), 0);
    gl.uniform1f(uHas, 0);
    // The coin face is the real USDC mark: serialise the hidden icon, rasterise it and use it as a texture.
    const svg = mark.current?.querySelector("svg");
    let tex: WebGLTexture | null = null;
    let alive = true;
    if (svg) {
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", "256");
      clone.setAttribute("height", "256");
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        c.getContext("2d")!.drawImage(img, 0, 0, 256, 256);
        tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1f(uHas, 1);
        draw();
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    }

    let visible = true, raf = 0, z = progress.get(), target = z, vel = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    const draw = () => {
      raf = 0;
      const dz = (target - z) * 0.12; // the camera glides toward where the scroll is
      z += dz;
      vel += (Math.min(1, Math.abs(dz) * 90) - vel) * 0.2;
      gl.uniform1f(uZ, z);
      gl.uniform1f(uV, vel);
      gl.uniform1f(uT, performance.now() % 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (visible && (Math.abs(target - z) > 0.0004 || vel > 0.01)) raf = requestAnimationFrame(draw);
    };
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(draw); };
    const un = progress.on("change", (v) => { target = v; kick(); });
    resize();
    draw();
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) kick(); });
    io.observe(canvas);
    return () => { alive = false; un(); cancelAnimationFrame(raf); if (tex) gl.deleteTexture(tex); ro.disconnect(); io.disconnect(); gl.deleteProgram(prog); gl.deleteBuffer(buf); };
  }, [progress, off]);

  if (off) return <div aria-hidden className={className} style={{ background: "radial-gradient(60% 60% at 50% 50%, rgba(36,86,201,.22), transparent 70%)" }} />;
  return (
    <>
      <span ref={mark} aria-hidden className="pointer-events-none absolute -left-[9999px] size-0 overflow-hidden"><TokenIcon symbol="USDC" size={256} /></span>
      <canvas ref={ref} aria-hidden className={className} />
    </>
  );
}
