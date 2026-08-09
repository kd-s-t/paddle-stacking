"use client";

import { createTimeline, eases } from "animejs";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  onDismiss: () => void;
};

export function WelcomeOverlay({ onDismiss }: Props) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const cta = ctaRef.current;
    if (!root || !cta) return;

    const logo = root.querySelector<HTMLElement>(".welcome-hex__mark");
    const hexagon = root.querySelector<SVGPolygonElement>(
      ".welcome-hex__hexagon",
    );
    const circle = root.querySelector<SVGCircleElement>(
      ".welcome-hex__circle",
    );
    const mask = root.querySelector<SVGCircleElement>(".welcome-hex__mask");
    const text = root.querySelector<HTMLElement>(".welcome-hex__text");

    if (!logo || !hexagon || !circle || !mask || !text) return;

    const elastic = eases.outElastic(1, 0.6);

    const timeline = createTimeline({
      autoplay: true,
      delay: 80,
    })
      .add(
        root,
        {
          opacity: [0, 1],
          duration: 700,
          ease: "outQuad",
        },
        0,
      )
      .add(
        logo,
        {
          opacity: [0, 1],
          duration: 900,
          ease: "outQuad",
        },
        120,
      )
      .add(
        hexagon,
        {
          rotate: [-90, 0],
          duration: 1200,
          ease: elastic,
        },
        180,
      )
      .add(
        circle,
        {
          scale: [0, 1],
          duration: 1200,
          ease: elastic,
        },
        520,
      )
      .add(
        mask,
        {
          scale: [0, 1],
          duration: 1000,
          ease: elastic,
        },
        570,
      )
      .add(
        text,
        {
          translateX: ["-100%", 0],
          opacity: [0, 1],
          duration: 1000,
          ease: "outExpo",
        },
        900,
      )
      .add(
        cta,
        {
          opacity: [0, 1],
          duration: 700,
          ease: "outQuad",
        },
        1200,
      );

    return () => {
      timeline.pause();
      timeline.revert();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="welcome-hex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-hex-title"
    >
      <div className="welcome-hex__glow" aria-hidden />

      <div className="welcome-hex__logo">
        <figure className="welcome-hex__mark">
          <svg width="100%" height="100%" viewBox="0 0 148 128" aria-hidden>
            <defs>
              <mask id={`${uid}-circle-mask`}>
                <rect fill="white" width="100%" height="100%" />
                <circle
                  className="welcome-hex__mask"
                  fill="black"
                  cx="120"
                  cy="96"
                  r="28"
                />
              </mask>
            </defs>
            <polygon
              className="welcome-hex__hexagon"
              fill="var(--welcome-hex)"
              points="64 128 8.574 96 8.574 32 64 0 119.426 32 119.426 96"
              mask={`url(#${uid}-circle-mask)`}
            />
            <circle
              className="welcome-hex__circle"
              fill="var(--welcome-circle)"
              cx="120"
              cy="96"
              r="20"
            />
          </svg>
        </figure>
        <div className="welcome-hex__title">
          <p id="welcome-hex-title" className="welcome-hex__text font-display">
            paddle<span>stack</span>
          </p>
        </div>
      </div>

      <div ref={ctaRef} className="welcome-hex__cta">
        <p className="welcome-hex__lede">
          Fair open-play rotations from your phone. No sessions yet on this
          device.
        </p>
        <Button
          size="lg"
          className="font-display h-14 w-full max-w-xs text-lg tracking-wide uppercase shadow-[var(--shadow)]"
          onClick={() => router.push("/new")}
        >
          New session
        </Button>
        <button
          type="button"
          className="welcome-hex__skip"
          onClick={onDismiss}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
