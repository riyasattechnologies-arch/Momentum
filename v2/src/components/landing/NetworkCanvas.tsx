"use client";
import { useEffect, useRef } from "react";

// Ambient "ontology" field: drifting nodes that link when close, and lean toward the cursor.
export function NetworkCanvas({ density = 0.00009, className = "" }: { density?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mouse = { x: -9999, y: -9999 };
    type P = { x: number; y: number; vx: number; vy: number; r: number; hub: boolean; phase: number };
    let pts: P[] = [];
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(28, Math.min(140, Math.round(w * h * density)));
      pts = Array.from({ length: n }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, r: i % 11 === 0 ? 2.6 : 1.3, hub: i % 11 === 0, phase: Math.random() * Math.PI * 2 }));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const link = Math.min(150, Math.max(90, w / 9));
      for (const p of pts) {
        if (!reduce) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 180 * 180) { p.vx += dx * 0.000012; p.vy += dy * 0.000012; }
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.999; p.vy *= 0.999;
          if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20; if (p.y > h + 20) p.y = -20;
        }
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < link) {
            const near = Math.hypot(mouse.x - a.x, mouse.y - a.y) < 160;
            ctx.strokeStyle = near ? `rgba(76,158,255,${0.55 * (1 - d / link)})` : `rgba(138,153,167,${0.16 * (1 - d / link)})`;
            ctx.lineWidth = a.hub || b.hub ? 0.9 : 0.6;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        const pulse = p.hub ? 0.6 + 0.4 * Math.sin(t / 700 + p.phase) : 1;
        ctx.fillStyle = p.hub ? `rgba(47,211,208,${0.9 * pulse})` : "rgba(221,228,234,0.55)";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        if (p.hub) { ctx.strokeStyle = `rgba(47,211,208,${0.25 * pulse})`; ctx.beginPath(); ctx.arc(p.x, p.y, 7 + 3 * pulse, 0, Math.PI * 2); ctx.stroke(); }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    const onMove = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave); };
  }, [density]);
  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true" />;
}
