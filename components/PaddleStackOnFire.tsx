"use client";

import { animate, createTimer, utils } from "animejs";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Ember = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  color: string;
  draw: (ctx: CanvasRenderingContext2D) => void;
};

const ORANGE_FLAME = ["#ff3b1f", "#ff6a1a", "#ffb347", "#ffe566", "#ff8a3d"];
const BLUE_FLAME = ["#1f6bff", "#2f6fed", "#5aa8ff", "#7ec8ff", "#b8e0ff"];

/** Rising ember / flame aura for hot paddles. */
export function OnFireBurn({
  size = "md",
  tone = "orange",
}: {
  size?: "sm" | "md";
  tone?: "orange" | "blue";
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const host = root;
    const surface = canvas;
    const draw = ctx;

    const colors = tone === "blue" ? BLUE_FLAME : ORANGE_FLAME;
    const core = tone === "blue" ? "#e8f4ff" : "#fff8d0";
    const fade =
      tone === "blue" ? "rgba(30,100,255,0)" : "rgba(255,40,0,0)";

    const embers: Ember[] = [];
    const animations: ReturnType<typeof animate>[] = [];
    const intervals: number[] = [];

    function resize() {
      const rect = host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      surface.width = Math.max(1, Math.floor(rect.width * dpr));
      surface.height = Math.max(1, Math.floor(rect.height * dpr));
      draw.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createEmber(): Ember {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const ember: Ember = {
        x: w * 0.5 + utils.random(-w * 0.3, w * 0.3),
        y: h * 0.78,
        r: utils.random(size === "sm" ? 1.8 : 2.4, size === "sm" ? 3.6 : 5),
        alpha: 1,
        color: colors[utils.random(0, colors.length - 1)]!,
        draw(c) {
          c.globalAlpha = Math.max(0, ember.alpha);
          const g = c.createRadialGradient(
            ember.x,
            ember.y,
            0,
            ember.x,
            ember.y,
            ember.r * 2.4,
          );
          g.addColorStop(0, core);
          g.addColorStop(0.3, ember.color);
          g.addColorStop(1, fade);
          c.fillStyle = g;
          c.beginPath();
          c.ellipse(
            ember.x,
            ember.y,
            ember.r * 0.7,
            ember.r * 1.45,
            0,
            0,
            Math.PI * 2,
          );
          c.fill();
          c.globalAlpha = 1;
        },
      };
      return ember;
    }

    function spawnEmber() {
      resize();
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const ember = createEmber();
      embers.push(ember);

      const rise = animate(ember, {
        y: ember.y - utils.random(h * 0.6, h * 1.05),
        x: ember.x + utils.random(-w * 0.22, w * 0.22),
        r: ember.r * utils.random(0.15, 0.5),
        alpha: 0,
        duration: utils.random(480, 900),
        ease: "outQuad",
        onComplete: () => {
          const i = embers.indexOf(ember);
          if (i > -1) embers.splice(i, 1);
          const ai = animations.indexOf(rise);
          if (ai > -1) animations.splice(ai, 1);
        },
      });
      animations.push(rise);
    }

    resize();
    for (let i = 0; i < 8; i++) spawnEmber();

    const render = createTimer({
      onUpdate: () => {
        const rect = host.getBoundingClientRect();
        draw.clearRect(0, 0, rect.width, rect.height);
        embers.forEach((e) => e.draw(draw));
      },
    });

    intervals.push(
      window.setInterval(() => {
        spawnEmber();
        if (Math.random() > 0.4) spawnEmber();
      }, 85),
    );

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      intervals.forEach((id) => window.clearInterval(id));
      render.pause();
      animations.forEach((a) => {
        a.pause();
        a.revert();
      });
    };
  }, [size, tone]);

  return (
    <span
      ref={rootRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-1/2 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2",
        size === "sm" ? "size-12" : "size-14",
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </span>
  );
}
