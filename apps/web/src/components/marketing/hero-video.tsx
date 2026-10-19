"use client";

import { useEffect, useRef, useState } from "react";
import { useCompact } from "@/components/marketing/motion/use-compact";

/**
 * The hero background: a looping render of an iridescent glass wave, shown at its original resolution and played slowly.
 *
 * The file is the source video with its audio track removed (a stream copy, no re-encode), so its quality is untouched. The poster is
 * its first frame at full resolution: it paints at once, stays where autoplay is blocked (low-power mode, data saver) and is what
 * people who prefer reduced motion see. The clip has a white ground, so it is blended with `multiply` over the white hero, and a white
 * wash keeps the area behind the headline pure #FFFFFF. It plays only while on screen and while the tab is visible.
 */
const RATE = 0.65;

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const compact = useCompact();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const still = compact || !mounted; // the video element only exists on a wide screen after hydration, so a phone never downloads it

  useEffect(() => {
    const v = ref.current;
    if (!v || still) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    v.muted = true; // autoplay needs the property set before play(), React only renders the attribute
    v.defaultPlaybackRate = RATE;
    v.playbackRate = RATE;
    const apply = () => { v.playbackRate = RATE; };
    v.addEventListener("loadedmetadata", apply);
    v.addEventListener("play", apply);

    let visible = true;
    const sync = () => {
      if (reduce || document.hidden || !visible) v.pause();
      else void v.play().catch(() => {}); // blocked autoplay leaves the poster up
    };
    const io = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; sync(); });
    io.observe(v);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      v.removeEventListener("loadedmetadata", apply);
      v.removeEventListener("play", apply);
    };
  }, [still]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-white">
      {still ? (
        // Phones get the still frame: a 3 MB looping video blended over the page is too much for a phone's decoder and compositor.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/hero/hero-bg-poster.webp" alt="" className="absolute inset-0 size-full select-none object-cover mix-blend-multiply [object-position:60%_100%]" />
      ) : (
      <video
        ref={ref}
        className="absolute inset-0 size-full select-none object-cover mix-blend-multiply [object-position:60%_100%] xl:[object-position:100%_100%]"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/hero/hero-bg-poster.webp"
      >
        <source src="/hero/hero-bg.mp4" type="video/mp4" />
      </video>
      )}
      {/* Pure white behind the headline: a vertical fade on phones (copy on top), a corner wash on desktop (copy on the left). */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#fff_0%,#fff_34%,rgba(255,255,255,0)_58%)] xl:hidden" />
      <div className="absolute inset-0 hidden bg-[radial-gradient(ellipse_58%_72%_at_0%_0%,#fff_0%,#fff_52%,rgba(255,255,255,0)_100%)] xl:block" />
    </div>
  );
}
