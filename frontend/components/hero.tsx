"use client";

import { gsap } from "gsap";
import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

export function OrderHero() {
  const stage = useRef<HTMLDivElement>(null);
  const model = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const area = stage.current;
    const art = model.current;
    if (!area || !art) return;
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(art, { y: 12, opacity: 0.65 }, { y: 0, opacity: 1, duration: 0.75, ease: "power2.out" });
    });

    media.add("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)", () => {
      const stageElement = area;
      const turn = gsap.quickTo(art, "rotationY", { duration: 0.5, ease: "power3" });
      const tilt = gsap.quickTo(art, "rotationX", { duration: 0.5, ease: "power3" });
      const slide = gsap.quickTo(art, "x", { duration: 0.45, ease: "power3" });
      function move(event: PointerEvent) {
        const bounds = stageElement.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        turn(x * 24);
        tilt(-y * 18);
        slide(x * 20);
      }
      function reset() {
        turn(0);
        tilt(0);
        slide(0);
      }
      area.addEventListener("pointermove", move);
      area.addEventListener("pointerleave", reset);
      return () => {
        area.removeEventListener("pointermove", move);
        area.removeEventListener("pointerleave", reset);
      };
    });

    return () => media.revert();
  }, []);

  return (
    <section className="order-hero" aria-labelledby="orders-title">
      <div className="hero-copy">
        <h1 id="orders-title">Order overview</h1>
        <p>Create orders, check stock and manage fulfilment.</p>
        <Link className="button primary" href="/orders/new"><Plus size={18} /> New order</Link>
      </div>
      <div className="hero-stage" ref={stage} aria-hidden="true">
        <div className="orbit orbit-outer" />
        <div className="orbit orbit-inner" />
        <div className="hero-model" ref={model}>
          <Image src="/parcel.webp" width={650} height={593} alt="" priority unoptimized />
        </div>
      </div>
    </section>
  );
}
