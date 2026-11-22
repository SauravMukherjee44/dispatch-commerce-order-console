"use client";

import { gsap } from "gsap";
import { Box, Focus, Grid2X2, Move, Package, PackageCheck, RotateCcw, ShieldAlert, Truck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { stations, type Station } from "@/lib/operations";
import { buildWarehouse } from "./warehouse-model";

const icons = { stock: Box, intake: Package, packing: PackageCheck, dispatch: Truck, returns: RotateCcw, hold: ShieldAlert };
const angles = { orbit: [6.3, 11.8, 16], top: [0, 18, .001] } as const;

type SceneControls = {
  move: (station: Station) => void;
  setView: (view: keyof typeof angles) => void;
};

export function WarehouseFallback({ station, caption }: { station: Station; caption: string }) {
  return (
    <div className="warehouse-fallback" aria-label={`Warehouse diagram. Current station: ${stations[station].label}.`}>
      <div className="warehouse-map">
        {(["stock", "hold", "returns", "intake", "packing", "dispatch"] as const).map((key) => {
          const Icon = icons[key];
          return <div key={key} className={key === station ? "current" : ""}><Icon size={22} /><span>{stations[key].label}</span></div>;
        })}
      </div>
      <span>{caption}</span>
    </div>
  );
}

export function WarehouseScene({ station }: { station: Station }) {
  const mount = useRef<HTMLDivElement>(null);
  const control = useRef<SceneControls | null>(null);
  const initial = useRef(station);
  const [mode, setMode] = useState<"loading" | "3d" | "fallback">("loading");
  const [view, setView] = useState<keyof typeof angles>("orbit");

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setMode("fallback");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const { scene, parcel, highlight, dispose } = buildWarehouse();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 75);
    const controls = new OrbitControls(camera, renderer.domElement);
    const pointer = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.rotateSpeed = .65;
    controls.minPolarAngle = .28;
    controls.maxPolarAngle = 1.12;
    controls.target.set(0, .36, -.18);

    let tween: gsap.core.Timeline | null = null;
    let current = initial.current;
    let cameraView: keyof typeof angles = "orbit";
    let lost = false;

    function render() {
      if (!lost) renderer.render(scene, camera);
    }

    function updateInteraction() {
      controls.enabled = pointer.matches && cameraView === "orbit";
      renderer.domElement.style.touchAction = controls.enabled ? "none" : "pan-y";
    }

    function setView(view: keyof typeof angles) {
      cameraView = view;
      const [x, y, z] = angles[view];
      camera.position.set(x, y, z);
      camera.lookAt(controls.target);
      updateInteraction();
      if (view === "orbit") controls.update();
      render();
    }

    function resize(entries: ResizeObserverEntry[]) {
      const rect = entries[0].contentRect;
      if (!rect.width || !rect.height) return;
      const ratio = rect.width / rect.height;
      const extent = Math.max(20.45, ratio * 10.85);
      camera.left = -extent / 2;
      camera.right = extent / 2;
      camera.top = extent / ratio / 2;
      camera.bottom = -extent / ratio / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
      render();
    }

    function move(station: Station) {
      if (current === station) return;
      current = station;
      tween?.kill();
      highlight(station);
      const { x, z } = stations[station];
      if (reduced.matches || lost) {
        parcel.position.set(x, .165, z);
        parcel.rotation.y = 0;
        render();
        return;
      }

      tween = gsap.timeline({ onUpdate: render });
      tween.to(parcel.position, { x, z, duration: .8, ease: "power2.inOut" }, 0)
        .to(parcel.position, { y: 1.87, duration: .34, ease: "power2.out" }, 0)
        .to(parcel.position, { y: .165, duration: .41, ease: "power2.in" }, .39)
        .to(parcel.rotation, { y: parcel.rotation.y + Math.PI * 2, duration: .8, ease: "power1.inOut" }, 0);
    }

    function contextLost(event: Event) {
      event.preventDefault();
      lost = true;
      setMode("fallback");
    }

    function contextRestored() {
      lost = false;
      setMode("3d");
      render();
    }

    parcel.position.set(stations[current].x, .165, stations[current].z);
    highlight(current);
    setView("orbit");
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    pointer.addEventListener("change", updateInteraction);
    controls.addEventListener("change", render);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener("webglcontextrestored", contextRestored);
    control.current = { move, setView };
    setMode("3d");

    return () => {
      control.current = null;
      tween?.kill();
      observer.disconnect();
      pointer.removeEventListener("change", updateInteraction);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", contextRestored);
      controls.dispose();
      dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => control.current?.move(station), [station]);

  function changeView(view: keyof typeof angles) {
    control.current?.setView(view);
    setView(view);
  }

  return (
    <>
      <div className="warehouse-canvas" data-renderer={mode} ref={mount} />
      {mode !== "3d" ? <WarehouseFallback station={station} caption={mode === "loading" ? "Loading warehouse…" : "Warehouse map · 3D unavailable on this device"} /> : (
        <>
          {view === "orbit" && <span className="warehouse-orbit-hint"><Move size={14} /> Drag to rotate</span>}
          <div className="warehouse-camera" role="group" aria-label="Warehouse camera">
            <button className="icon-button" type="button" aria-pressed={view === "orbit"} aria-label="Isometric view" title="Isometric view" onClick={() => changeView("orbit")}><Focus size={17} /></button>
            <button className="icon-button" type="button" aria-pressed={view === "top"} aria-label="Top view" title="Top view" onClick={() => changeView("top")}><Grid2X2 size={17} /></button>
          </div>
        </>
      )}
    </>
  );
}
