"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, X } from "lucide-react";
import { cn } from "@/components/ui";

/** Полноэкранный сканер: камера + распознавание штрихкода. Вызывает onResult один раз. */
export function BarcodeScanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const resultRef = useRef(onResult);
  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        const { createDetector } = await import("@/lib/barcode");
        const detector = createDetector();
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const value = codes[0]?.rawValue?.trim();
              if (value) {
                stopped = true;
                navigator.vibrate?.(60);
                resultRef.current(value);
                return;
              }
            }
          } catch {}
          timer = setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        const name = (e as Error)?.name;
        setError(
          name === "NotAllowedError"
            ? "Нет доступа к камере. Разрешите камеру для этого сайта в настройках браузера."
            : "Камера недоступна на этом устройстве.",
        );
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pt-[calc(var(--safe-top)+12px)] pb-3 text-white">
        <p className="font-semibold">Сканируйте штрихкод</p>
        <button onClick={onClose} className="rounded-full bg-white/15 p-2" aria-label="Закрыть">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
        {!error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative h-40 w-[78%] max-w-sm rounded-2xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className={cn("absolute inset-x-3 top-1/2 h-0.5 bg-brand-400 shadow-[0_0_12px_#6096fa]", ready && "animate-pulse")} />
            </div>
          </div>
        )}
        {error && <p className="absolute inset-x-6 top-1/3 text-center text-white">{error}</p>}
      </div>
      <p className="pb-safe px-6 pt-3 pb-4 text-center text-sm text-white/70">Наведите камеру на штрихкод товара</p>
    </div>
  );
}

export function ScanButton({ onResult, className, label }: { onResult: (code: string) => void; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center justify-center gap-1.5 rounded-xl text-brand-600 transition hover:bg-brand-50 active:scale-95", className)}
        aria-label="Сканировать штрихкод"
        title="Сканировать штрихкод"
      >
        <ScanLine className="size-5" />
        {label && <span className="text-sm font-semibold">{label}</span>}
      </button>
      {open && (
        <BarcodeScanner
          onClose={() => setOpen(false)}
          onResult={(code) => {
            setOpen(false);
            onResult(code);
          }}
        />
      )}
    </>
  );
}
