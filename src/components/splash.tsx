"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";

const KEY = "sohtmon-splash";
const DURATION = 2300;

/**
 * 3D-заставка с логотипом: показывается один раз за сессию (при запуске приложения).
 * Скрипт в <head> заранее ставит класс .no-splash, если заставка уже была, — без мерцания.
 */
export function Splash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
      sessionStorage.setItem(KEY, "1");
    } catch {}
    // Уже показана в этой сессии: CSS (.no-splash) скрывает её сразу, здесь просто убираем из DOM
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setVisible(false), seen ? 0 : reduced ? 500 : DURATION);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  const faces = ["front", "back", "right", "left", "top", "bottom"] as const;

  return (
    <div className="splash" onClick={() => setVisible(false)} aria-hidden>
      <div className="splash-glow" />
      <div className="splash-scene">
        <div className="splash-cube">
          {faces.map((f) => (
            <div key={f} className={`splash-face splash-${f}`}>
              <LogoMark size={128} />
            </div>
          ))}
        </div>
        <div className="splash-shadow" />
      </div>
      <div className="splash-title">
        <p className="splash-name">SOHTMON</p>
        <p className="splash-sub">ERP · склад · продажи · финансы</p>
      </div>
    </div>
  );
}

export const splashInitScript = `try{if(sessionStorage.getItem("${KEY}")==="1")document.documentElement.classList.add("no-splash")}catch(e){}`;
