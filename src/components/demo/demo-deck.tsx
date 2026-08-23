"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BrowserFrame } from "@/components/demo/browser-frame";
import { SLIDES, type Slide } from "@/components/demo/slides";
import { cn } from "@/lib/utils";

/**
 * The demo deck -- screen 0 of the presentation, and the only surface on stage.
 *
 * `.deck` (globals.css) inverts the ground for this subtree only. Platanus
 * requires dark slides so the stream reads well; the product stays light-only.
 *
 * Navigation is keyboard-first (arrows, space, Home/End) with visible controls
 * as the recovery path -- once a click lands inside the live iframe, keydown
 * stops reaching this document, and the arrows are the only way back.
 */
export function DemoDeck() {
  const [index, setIndex] = useState(0);

  const go = useCallback((delta: number) => {
    setIndex((current) =>
      Math.min(SLIDES.length - 1, Math.max(0, current + delta))
    );
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          event.preventDefault();
          go(1);
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          go(-1);
          break;
        case "Home":
          event.preventDefault();
          setIndex(0);
          break;
        case "End":
          event.preventDefault();
          setIndex(SLIDES.length - 1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const slide = SLIDES[index];

  return (
    <main className="deck relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* The slide itself. `key` forces a remount so the entrance animation
          replays on every advance -- without it React reuses the node and the
          deck moves without ever appearing to. */}
      <div key={slide.id} className="flex min-h-0 flex-1 flex-col">
        <SlideBody slide={slide} />
      </div>

      <DeckChrome
        index={index}
        total={SLIDES.length}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      />
    </main>
  );
}

function SlideBody({ slide }: { slide: Slide }) {
  switch (slide.kind) {
    case "cover":
      return (
        <Center>
          <Wordmark className="text-[clamp(4rem,14vw,11rem)]" />
          {/* Sized up and tracked out: two words under a huge wordmark read as
              an afterthought at lede size. This is a tagline, not a subtitle. */}
          <p className="max-w-4xl text-balance text-center font-sans text-ink-soft text-[clamp(1.75rem,4vw,3.25rem)] leading-snug tracking-wide">
            {slide.lede}
          </p>
        </Center>
      );

    case "statement":
      return (
        <Center>
          <h1 className="max-w-6xl text-balance text-center font-display font-extrabold text-[clamp(2.75rem,7vw,6.5rem)] leading-[1.05] tracking-tight">
            {slide.title}
          </h1>
          {slide.sub ? (
            <p className="max-w-4xl text-balance text-center font-sans text-ink-soft text-[clamp(1.5rem,3.2vw,2.75rem)] leading-snug">
              {slide.sub}
            </p>
          ) : null}
          {slide.source ? <Source>{slide.source}</Source> : null}
        </Center>
      );

    case "figures":
      return (
        <Center>
          <h1 className="max-w-6xl text-balance text-center font-display font-extrabold text-[clamp(2.5rem,6vw,5.5rem)] leading-[1.05] tracking-tight">
            {slide.title}
          </h1>
          <dl className="flex w-full max-w-5xl flex-wrap items-start justify-center gap-x-24 gap-y-8">
            {slide.figures.map((figure) => (
              <div
                key={figure.label}
                className="flex flex-col gap-2 text-center"
              >
                <dt className="font-display font-extrabold text-[clamp(3rem,7vw,6rem)] text-primary leading-none tracking-tight">
                  {figure.value}
                </dt>
                <dd className="text-balance font-sans text-ink-soft text-[clamp(1.1rem,2vw,1.75rem)] leading-snug">
                  {figure.label}
                </dd>
              </div>
            ))}
          </dl>
          {slide.footer ? (
            <p className="max-w-4xl text-balance text-center font-sans text-[clamp(1.15rem,2.2vw,2rem)] text-ink-soft leading-snug">
              {slide.footer}
            </p>
          ) : null}
        </Center>
      );

    case "live":
      return (
        <div className="flex min-h-0 flex-1 flex-col px-6 pt-6 pb-2">
          <BrowserFrame className="flex-1" />
        </div>
      );

    case "closing":
      return (
        <Center>
          <Wordmark className="text-[clamp(4.5rem,16vw,13rem)]" />
          <p className="max-w-5xl text-balance text-center font-display font-bold text-[clamp(1.5rem,3.4vw,3rem)] leading-snug">
            {slide.line}
          </p>
          <Source>dipia.lat</Source>
        </Center>
      );
  }
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-10 text-center">
      {children}
    </div>
  );
}

/** Always lowercase, one word, tight tracking -- the wordmark IS the logo. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display font-extrabold leading-none tracking-tight",
        className
      )}
    >
      dipia<span className="text-primary">.</span>
    </span>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-ink-faint text-[clamp(0.75rem,1.1vw,1rem)] uppercase tracking-widest">
      {children}
    </p>
  );
}

/**
 * Progress and manual controls. Deliberately quiet: on a projector this must
 * never compete with the slide, but it has to stay reachable because the live
 * iframe steals keyboard focus the moment anyone clicks into it.
 */
function DeckChrome({
  index,
  total,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-6 px-6 py-4 opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={onPrev}
        disabled={index === 0}
        aria-label="Diapositiva anterior"
        className="rounded-full p-2 text-ink-soft disabled:opacity-30"
      >
        <ChevronLeft className="size-6" />
      </button>

      <div className="flex items-center gap-2" aria-hidden>
        {Array.from({ length: total }, (_, position) => (
          <span
            key={SLIDES[position].id}
            className={cn(
              "h-1.5 rounded-full transition-all",
              position === index ? "w-8 bg-primary" : "w-1.5 bg-ink-faint"
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={index === total - 1}
        aria-label="Siguiente diapositiva"
        className="rounded-full p-2 text-ink-soft disabled:opacity-30"
      >
        <ChevronRight className="size-6" />
      </button>
    </div>
  );
}
