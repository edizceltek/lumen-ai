"use client";

import { ChangeEvent, DragEvent, MouseEvent, TouchEvent, useEffect, useRef, useState } from "react";
import { ResultsDashboard, type AnalysisResult } from "./components/ResultsDashboard";

type Screen = "landing" | "upload" | "scan" | "result";
type FrameTransform = { x: number; y: number; zoom: number };

const scanSteps = [
  "Yüz simetrisi ölçülüyor...",
  "Çene hattı ve elmacık kemikleri taranıyor...",
  "Cilt dokusu ve göz bölgesi analiz ediliyor...",
];

const DAILY_LIMIT = 5;
const QUOTA_STORAGE_KEY = "lumen-analiz-kullanimi";

function remainingClientQuota() {
  if (typeof window === "undefined") return DAILY_LIMIT;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const usage = (JSON.parse(window.localStorage.getItem(QUOTA_STORAGE_KEY) ?? "[]") as number[]).filter((timestamp) => timestamp > cutoff);
  window.localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(usage));
  return Math.max(0, DAILY_LIMIT - usage.length);
}

async function compressPhoto(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Fotoğraf okunamadı."));
      element.src = source;
    });
    const maxDim = 960;
    const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Fotoğraf hazırlanamadı.");
    context.fillStyle = "#09090B";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function mirrorDataUrl(dataUrl: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Görsel çevrilemedi."));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function renderFramedPhoto(dataUrl: string, frame: FrameTransform): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Görsel hazırlanamadı."));
    el.src = dataUrl;
  });

  const outW = 640;
  const outH = 500;
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.fillStyle = "#09090B";
  ctx.fillRect(0, 0, outW, outH);

  const baseScale = Math.max(outW / image.width, outH / image.height);
  const drawW = image.width * baseScale * frame.zoom;
  const drawH = image.height * baseScale * frame.zoom;
  const offsetX = (outW - drawW) / 2 + (frame.x / 100) * outW;
  const offsetY = (outH - drawH) / 2 + (frame.y / 100) * outH;

  ctx.drawImage(image, offsetX, offsetY, drawW, drawH);
  return canvas.toDataURL("image/jpeg", 0.82);
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function validateImageFile(file: File) {
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) return "Lütfen JPG, PNG veya WebP formatında bir fotoğraf seç.";
  if (file.size > 10 * 1024 * 1024) return "Fotoğraf 10 MB'tan küçük olmalı.";
  return undefined;
}

async function createSampleFace() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd8e3"/><stop offset="1" stop-color="#9fb0c4"/></linearGradient>
      <radialGradient id="skin" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#f0c9a8"/><stop offset="1" stop-color="#d9a77e"/></radialGradient>
    </defs>
    <rect width="800" height="1000" fill="url(#bg)"/>
    <path d="M110 1000 C130 820 270 780 400 780 C530 780 670 820 690 1000Z" fill="#2f3b4f"/>
    <rect x="335" y="640" width="130" height="170" rx="40" fill="#d3a077"/>
    <ellipse cx="238" cy="470" rx="30" ry="52" fill="#d9a77e"/><ellipse cx="562" cy="470" rx="30" ry="52" fill="#d9a77e"/>
    <path d="M400 190 C555 190 600 330 595 470 C590 620 505 730 400 730 C295 730 210 620 205 470 C200 330 245 190 400 190Z" fill="url(#skin)"/>
    <path d="M200 440 C175 250 290 130 410 135 C540 140 625 250 600 440 C585 360 540 290 400 285 C260 290 215 360 200 440Z" fill="#3a2a22"/>
    <path d="M285 405 Q325 385 365 402" stroke="#3a2a22" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M435 402 Q475 385 515 405" stroke="#3a2a22" stroke-width="12" fill="none" stroke-linecap="round"/>
    <ellipse cx="327" cy="450" rx="30" ry="15" fill="#fff"/><ellipse cx="473" cy="450" rx="30" ry="15" fill="#fff"/>
    <circle cx="327" cy="450" r="12" fill="#4a3426"/><circle cx="473" cy="450" r="12" fill="#4a3426"/>
    <circle cx="327" cy="450" r="5" fill="#111"/><circle cx="473" cy="450" r="5" fill="#111"/>
    <path d="M400 460 C392 520 380 555 372 580 Q400 600 428 580 C420 555 408 520 400 460Z" fill="#c8946b" opacity=".55"/>
    <path d="M345 655 Q400 690 455 655" stroke="#9b4d4d" stroke-width="12" fill="none" stroke-linecap="round"/>
  </svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error("Örnek görsel oluşturulamadı.")); el.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 800;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Örnek görsel oluşturulamadı.");
    context.drawImage(image, 0, 0, 640, 800);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally { URL.revokeObjectURL(url); }
}

function Icon({ name, className = "" }: { name: "lock" | "info" | "arrow" | "camera" | "image" | "check" | "spark" | "back" | "flip"; className?: string }) {
  const paths = {
    lock: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r=".6" fill="currentColor" /></>,
    arrow: <><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>,
    camera: <><path d="M4 7.8h3l1.5-2h7l1.5 2h3v10.8H4Z" /><circle cx="12" cy="13.2" r="3.1" /></>,
    image: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="8.3" cy="9" r="1.2" /><path d="m4 17 4.7-4.7 3.1 3.1 2.1-2.1L20 19" /></>,
    check: <path d="m5 12.4 4.2 4.1L19.5 6.2" />,
    spark: <path d="M12 2.5c.85 5.95 2.05 7.15 8 8-5.95.85-7.15 2.05-8 8-.85-5.95-2.05-7.15-8-8 5.95-.85 7.15-2.05 8-8Z" />,
    back: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
    flip: <><path d="M12 3v18" /><path d="m8 7-5 5 5 5V7Z" /><path d="m16 7 5 5-5 5V7Z" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function LumenMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lm-silver-l" x1="8" y1="10" x2="36" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#C7D0DC" />
          <stop offset="100%" stopColor="#525B6B" />
        </linearGradient>
        <linearGradient id="lm-silver-r" x1="56" y1="54" x2="28" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E5E9F0" />
          <stop offset="55%" stopColor="#94A0B4" />
          <stop offset="100%" stopColor="#3B4250" />
        </linearGradient>
        <linearGradient id="lm-ice" x1="18" y1="18" x2="46" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="50%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
      </defs>
      <path d="M32 6C20 12 12 22 12 32C12 42 20 52 32 58C25 48 22 40 22 32C22 24 25 16 32 6Z" fill="url(#lm-silver-l)" />
      <path d="M32 58C44 52 52 42 52 32C52 22 44 12 32 6C39 16 42 24 42 32C42 40 39 48 32 58Z" fill="url(#lm-silver-r)" />
      <path d="M32 13L43 32L32 51L21 32L32 13Z" stroke="url(#lm-ice)" strokeWidth="2.4" fill="rgba(56,189,248,0.12)" />
    </svg>
  );
}

function Logo({ large = false }: { large?: boolean }) {
  return (
    <div className={`flex items-center select-none ${large ? "gap-3" : "gap-2.5"}`}>
      <LumenMark size={large ? 38 : 26} />
      <span className={`font-semibold text-white/95 ${large ? "text-[20px] tracking-[0.28em]" : "text-[13px] tracking-[0.26em]"}`}>
        LUMEN
      </span>
    </div>
  );
}

function FaceGuide() {
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[76%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border-2 border-dashed border-ice/75 shadow-[0_0_24px_rgba(56,189,248,0.25)]" />
      <div className="pointer-events-none absolute left-1/2 top-[12%] z-10 h-[76%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-ice/45 to-transparent" />
    </>
  );
}

function UploadSlot({
  title,
  optional,
  image,
  frame,
  onFrameChange,
  onFile,
  onFlip,
}: {
  title: string;
  optional?: boolean;
  image?: string;
  frame: FrameTransform;
  onFrameChange: (next: FrameTransform) => void;
  onFile: (file: File) => void;
  onFlip?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [draggingFile, setDraggingFile] = useState(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const clampOffset = (v: number) => Math.max(-70, Math.min(70, Math.round(v * 10) / 10));

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = { startX: clientX, startY: clientY, origX: frame.x, origY: frame.y };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragRef.current || !frameBoxRef.current) return;
    const rect = frameBoxRef.current.getBoundingClientRect();
    const dx = ((clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((clientY - dragRef.current.startY) / rect.height) * 100;
    onFrameChange({
      ...frame,
      x: clampOffset(dragRef.current.origX + dx),
      y: clampOffset(dragRef.current.origY + dy),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!image || e.touches.length !== 1) return;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!dragRef.current || e.touches.length !== 1) return;
    e.preventDefault();
    moveDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!image) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    moveDrag(e.clientX, e.clientY);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDraggingFile(true);
      }}
      onDragLeave={() => setDraggingFile(false)}
      onDrop={handleDrop}
      className={`overflow-hidden rounded-[22px] border bg-white/[.025] transition ${
        draggingFile ? "border-ice/70 bg-ice/[.06]" : "border-white/[.09]"
      }`}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={handleChange}
      />

      <div
        ref={frameBoxRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        style={{ touchAction: image ? "none" : "auto" }}
        className={`relative aspect-[1.28/1] w-full overflow-hidden bg-black/50 select-none ${
          image ? "cursor-grab active:cursor-grabbing" : ""
        }`}
      >
        {image ? (
          <img
            src={image}
            alt={`${title} önizlemesi`}
            draggable={false}
            style={{
              transform: `translate3d(${frame.x}%, ${frame.y}%, 0) scale(${frame.zoom})`,
              transformOrigin: "center center",
            }}
            className="pointer-events-none h-full w-full object-cover opacity-90 will-change-transform"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="block h-full w-full bg-[radial-gradient(circle_at_50%_30%,rgba(56,189,248,.12),transparent_45%)] text-left"
          />
        )}

        <FaceGuide />

        {!image && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 grid place-items-center"
          >
            <div className="flex flex-col items-center gap-2">
              <div className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/20 text-white/70">
                <Icon name="image" className="size-5" />
              </div>
              <span className="text-[11px] text-white/45">
                {draggingFile ? "Bırak" : "Galeri veya Kamera seç"}
              </span>
            </div>
          </button>
        )}

        {image && (
          <>
            <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur-md">
              Parmağınla kaydır & ayarla
            </div>

            <button
              type="button"
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => inputRef.current?.click()}
              className="absolute right-3 top-3 z-20 rounded-full border border-white/20 bg-black/80 px-3 py-1 text-[10px] font-medium text-white backdrop-blur-md active:scale-95"
            >
              Değiştir
            </button>

            {onFlip && (
              <button
                type="button"
                onTouchStart={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onFlip()}
                className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/80 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md transition active:scale-95"
              >
                <Icon name="flip" className="size-3.5 text-ice" />
                <span>Aynayı Düzelt</span>
              </button>
            )}
          </>
        )}
      </div>

      {image && (
        <div className="space-y-2 border-t border-white/[.07] bg-black/40 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-12 text-[10px] text-white/50">Yakınlaştır</span>
            <input
              type="range"
              min={0.8}
              max={2.4}
              step={0.05}
              value={frame.zoom}
              onChange={(e) => onFrameChange({ ...frame, zoom: Number(e.target.value) })}
              className="h-1.5 flex-1 accent-[#38BDF8]"
            />
            <button
              type="button"
              onClick={() => onFrameChange({ x: 0, y: 0, zoom: 1 })}
              className="text-[10px] font-medium text-ice"
            >
              Sıfırla
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/45">Sağ/Sol</span>
              <input
                type="range"
                min={-60}
                max={60}
                step={1}
                value={frame.x}
                onChange={(e) => onFrameChange({ ...frame, x: Number(e.target.value) })}
                className="h-1.5 flex-1 accent-[#38BDF8]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/45">Yukarı/Aşağı</span>
              <input
                type="range"
                min={-60}
                max={60}
                step={1}
                value={frame.y}
                onChange={(e) => onFrameChange({ ...frame, y: Number(e.target.value) })}
                className="h-1.5 flex-1 accent-[#38BDF8]"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium text-white/90">{title}</span>
        <span className="text-[11px] text-white/40">{optional ? "İsteğe bağlı" : "Gerekli"}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [frontPhoto, setFrontPhoto] = useState<string>();
  const [profilePhoto, setProfilePhoto] = useState<string>();
  const [frontFrame, setFrontFrame] = useState<FrameTransform>({ x: 0, y: 0, zoom: 1 });
  const [sideFrame, setSideFrame] = useState<FrameTransform>({ x: 0, y: 0, zoom: 1 });
  const [framedFrontForResult, setFramedFrontForResult] = useState<string>();
  const [frontImage, setFrontImage] = useState<string>();
  const [sideImage, setSideImage] = useState<string>();
  const [analysis, setAnalysis] = useState<AnalysisResult>();
  const [analysisError, setAnalysisError] = useState<string>();
  const [step, setStep] = useState(0);
  const [remainingQuota, setRemainingQuota] = useState(DAILY_LIMIT);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [quotaReached, setQuotaReached] = useState(false);
  const [fileError, setFileError] = useState<string>();

  useEffect(() => {
    setRemainingQuota(remainingClientQuota());
    setIsLocalhost(["localhost", "127.0.0.1"].includes(window.location.hostname));
  }, []);

  useEffect(() => {
    if (screen !== "scan") return;
    setStep(0);
    const interval = window.setInterval(() => setStep((current) => (current + 1) % scanSteps.length), 1450);
    if (!frontImage) {
      setAnalysisError("Fotoğraf hazırlanamadı. Lütfen önden görünümü yeniden yükle.");
      return () => window.clearInterval(interval);
    }
    const controller = new AbortController();
    setAnalysisError(undefined);
    (async () => {
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frontImage, sideImage }),
          signal: controller.signal,
        });
        const rawText = await response.text();
        let payload: AnalysisResult & { error?: string; quotaExceeded?: boolean; remainingQuota?: number };
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new Error("Sunucu yanıt süresi doldu. Lütfen tekrar dene.");
        }
        if (payload.quotaExceeded) {
          setRemainingQuota(0); setQuotaReached(true); setScreen("upload"); return;
        }
        if (!response.ok || !payload.metrics || !payload.summary || !payload.recommendations) {
          throw new Error(payload.error || "Analiz şu anda tamamlanamadı. Lütfen tekrar dene.");
        }
        if (!payload.demo) {
          const usage = JSON.parse(window.localStorage.getItem(QUOTA_STORAGE_KEY) ?? "[]") as number[];
          const now = Date.now();
          window.localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify([...usage.filter((timestamp) => timestamp > now - 24 * 60 * 60 * 1000), now]));
          setRemainingQuota(payload.remainingQuota ?? remainingClientQuota());
        }
        setAnalysis(payload);
        setScreen("result");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAnalysisError(error instanceof Error ? error.message : "Analiz şu anda tamamlanamadı. Lütfen tekrar dene.");
      }
    })();
    return () => { window.clearInterval(interval); controller.abort(); };
  }, [screen, frontImage, sideImage]);

  const loadFile = async (file: File, target: "front" | "side") => {
    const problem = validateImageFile(file);
    if (problem) { setFileError(problem); return; }
    try {
      setFileError(undefined);
      const compressed = await compressPhoto(file);
      if (target === "front") {
        setFrontPhoto(compressed);
        setFrontFrame({ x: 0, y: 0, zoom: 1 });
      } else {
        setProfilePhoto(compressed);
        setSideFrame({ x: 0, y: 0, zoom: 1 });
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Fotoğraf okunamadı.");
    }
  };

  const flipPhoto = async (target: "front" | "side") => {
    try {
      if (target === "front" && frontPhoto) {
        const flipped = await mirrorDataUrl(frontPhoto);
        setFrontPhoto(flipped);
        setFrontFrame((f) => ({ ...f, x: -f.x }));
      } else if (target === "side" && profilePhoto) {
        const flipped = await mirrorDataUrl(profilePhoto);
        setProfilePhoto(flipped);
        setSideFrame((f) => ({ ...f, x: -f.x }));
      }
    } catch {}
  };

  const startAnalysis = async () => {
    if (!frontPhoto) return;
    try {
      setFileError(undefined);
      const croppedFront = await renderFramedPhoto(frontPhoto, frontFrame);
      const croppedSide = profilePhoto ? await renderFramedPhoto(profilePhoto, sideFrame) : undefined;
      setFramedFrontForResult(croppedFront);
      setFrontImage(croppedFront);
      setSideImage(croppedSide);
      setScreen("scan");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Fotoğraf hizalanamadı.");
    }
  };

  const quickTest = async () => {
    try {
      setFileError(undefined);
      const sample = await createSampleFace();
      setFrontPhoto(sample);
      setFramedFrontForResult(sample);
      setFrontImage(sample);
      setProfilePhoto(undefined);
      setSideImage(undefined);
      setScreen("scan");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Örnek görsel oluşturulamadı.");
    }
  };

  const reset = () => {
    setFrontPhoto(undefined);
    setProfilePhoto(undefined);
    setFramedFrontForResult(undefined);
    setFrontImage(undefined);
    setSideImage(undefined);
    setFrontFrame({ x: 0, y: 0, zoom: 1 });
    setSideFrame({ x: 0, y: 0, zoom: 1 });
    setAnalysis(undefined);
    setAnalysisError(undefined);
    setScreen("landing");
  };

  const resetTestQuota = async () => {
    await fetch("/api/analyze", { method: "DELETE" });
    window.localStorage.removeItem(QUOTA_STORAGE_KEY);
    setRemainingQuota(DAILY_LIMIT);
    setQuotaReached(false);
  };

  return <main className="min-h-dvh overflow-x-hidden bg-[#07080B]">
    <div className="noise pointer-events-none fixed inset-0 opacity-25" />
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[460px] flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:pt-6">
      {screen === "landing" && (
        <section className="relative flex flex-1 flex-col justify-between overflow-hidden fade-up">
          <div className="pointer-events-none absolute inset-x-[-20px] bottom-8 top-12 z-0 select-none">
            <div
              role="img"
              aria-hidden="true"
              className="pointer-events-none h-full w-full select-none bg-[url('/hero-sculpture.jpg')] bg-cover bg-right-bottom opacity-95"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#07080B] via-transparent to-[#07080B]" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#07080B]/85 via-transparent to-transparent" />
          </div>

          <header className="relative z-20 flex justify-center pt-1 sm:pt-3">
            <Logo large />
          </header>

          <div className="relative z-20 my-auto py-4">
            <div className="mb-3 h-[2px] w-9 rounded-full bg-[#7DD3FC]" />
            <h1 className="text-[clamp(30px,8.5vw,38px)] font-medium leading-[1.08] tracking-[-.04em] text-white">
              Yüz Potansiyelini
              <span className="mt-1 block text-[#8AB4E8]">Keşfet</span>
            </h1>
            <p className="mt-3 max-w-[235px] text-[13px] leading-5 text-white/65">
              Şu anda neredesin, en çok neyi geliştirebilirsin ve ilk olarak ne yapmalısın?
            </p>
          </div>

          <div className="relative z-20 space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => setScreen("upload")}
              className="flex h-13 sm:h-14 w-full cursor-pointer touch-manipulation items-center justify-center gap-3 rounded-full border border-[#93C5FD]/60 bg-[#0A0D14]/90 px-6 text-[15px] font-medium text-white shadow-[0_0_28px_rgba(56,189,248,.22)] backdrop-blur-md transition hover:border-[#93C5FD] hover:bg-[#101622] active:scale-[.985]"
            >
              <span>Yüzümü Analiz Et</span>
              <Icon name="arrow" className="size-4 text-white/85" />
            </button>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.12] bg-[#0B0D13]/85 px-4 py-2.5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <Icon name="lock" className="size-4 shrink-0 text-white/60" />
                <div>
                  <p className="text-[11px] font-medium text-white/90">Fotoğrafların sunucuda saklanmaz.</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-white/45">Yalnızca analiz sırasında güvenli şekilde işlenir ve ardından silinir.</p>
                </div>
              </div>
              <Icon name="info" className="size-4 shrink-0 text-white/45" />
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-0.5 text-[11px] text-white/55">
              <span className="h-px flex-1 bg-white/[.08]" />
              <LumenMark size={15} />
              <span>Lumen AI Destekli</span>
              <span className="h-px flex-1 bg-white/[.08]" />
            </div>
          </div>
        </section>
      )}

      {screen === "upload" && <section className="fade-up"><header className="mb-6 flex items-center justify-between"><button aria-label="Geri dön" onClick={() => setScreen("landing")} className="grid size-10 place-items-center rounded-full border border-white/[.09] text-white/75"><Icon name="back" className="size-5" /></button><Logo /><span className="w-10" /></header><div className="mb-5"><p className="text-[11px] font-medium tracking-[.16em] text-ice">ADIM 01 / 02</p><h1 className="mt-1.5 text-[28px] font-medium tracking-[-.045em]">Net fotoğraflar ekle</h1><p className="mt-1.5 text-sm leading-5 text-white/45">Yüzünü parmağınla veya alttaki çubuklarla kesikli çizgiye hizala.</p></div><div className="glass mb-4 flex items-center justify-between rounded-2xl px-4 py-3"><div><p className="text-[11px] text-white/42">Kalan Günlük Analiz Hakkı</p><p className="mt-1 font-mono text-sm tabular-nums text-ice">{remainingQuota}/{DAILY_LIMIT}</p></div><div className="flex gap-1.5">{Array.from({ length: DAILY_LIMIT }).map((_, index) => <span key={index} className={`size-2 rounded-full ${index < remainingQuota ? "bg-ice" : "bg-white/15"}`} />)}</div></div>{quotaReached || remainingQuota === 0 ? <div className="glass rounded-[22px] p-5 text-center"><p className="text-sm leading-6 text-white/78">Günlük ücretsiz analiz hakların doldu. Yarın yeni haklarınla tekrar analiz yapabilirsin.</p>{isLocalhost && <button onClick={() => void resetTestQuota()} className="mt-4 text-xs font-medium text-ice">Test Hakkını Sıfırla</button>}</div> : <><div className="space-y-3.5"><UploadSlot title="Önden Görünüm" image={frontPhoto} frame={frontFrame} onFrameChange={setFrontFrame} onFile={(file) => void loadFile(file, "front")} onFlip={() => void flipPhoto("front")} /><UploadSlot title="Yan Profil" optional image={profilePhoto} frame={sideFrame} onFrameChange={setSideFrame} onFile={(file) => void loadFile(file, "side")} onFlip={() => void flipPhoto("side")} /></div><div className="glass mt-4 flex gap-3 rounded-2xl p-3.5"><div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-ice/10 text-ice"><Icon name="spark" className="size-3.5" /></div><p className="text-[12px] leading-5 text-white/53">Doğal ışıkta, kameraya düz bakarak çek. Gözlük, şapka ve yoğun filtre kullanma.</p></div>{fileError && <p className="mt-3.5 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-[12px] leading-5 text-red-200/90">{fileError}</p>}<button disabled={!frontPhoto} onClick={() => void startAnalysis()} className="mt-4 flex h-13 sm:h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white text-sm font-semibold text-obsidian transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 active:scale-[.985]">Yüzümü Analiz Et <Icon name="arrow" className="size-[18px]" /></button>{isLocalhost && <button type="button" onClick={() => void quickTest()} className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ice/40 text-[13px] font-medium text-ice transition hover:bg-ice/[.06] active:scale-[.985]"><Icon name="spark" className="size-4" /> Örnek Fotoğrafla Hızlı Test Et</button>}</>}</section>}

      {screen === "scan" && <section className="flex flex-1 flex-col fade-up"><header className="flex justify-center"><Logo /></header><div className="flex flex-1 flex-col justify-center"><div className="relative mx-auto aspect-[.82] w-full max-w-[300px] overflow-hidden rounded-[30px] border border-white/[.12] bg-surface">{(framedFrontForResult || frontPhoto) && <img src={framedFrontForResult || frontPhoto} alt="Analiz edilen yüz" className="h-full w-full object-cover opacity-70 grayscale-[.15]" />}<div className="absolute inset-0 bg-gradient-to-b from-ice/[.03] via-transparent to-ice/[.08]" /><FaceGuide />{!analysisError && <><div className="scan-line absolute left-0 right-0 z-10 h-px bg-ice shadow-[0_0_18px_3px_rgba(56,189,248,.85)]" /><div className="absolute left-0 right-0 h-20 bg-gradient-to-b from-ice/[.16] to-transparent scan-line" /></>}</div><div className="mt-8 text-center">{analysisError ? <div className="glass rounded-2xl p-5"><p className="text-sm leading-6 text-white/75">{analysisError}</p><button onClick={() => setScreen("upload")} className="mt-4 text-sm font-medium text-ice">Fotoğrafları düzenle</button></div> : <><div className="mx-auto mb-4 flex justify-center gap-1.5">{scanSteps.map((_, index) => <span key={index} className={`h-1 rounded-full transition-all duration-500 ${index === step ? "w-6 bg-ice" : "w-1 bg-white/20"}`} />)}</div><p className="h-6 text-sm text-white/75 transition-all" key={step}>{scanSteps[step]}</p><p className="mt-1.5 text-[11px] text-white/35">Bu işlem birkaç saniye sürebilir</p></>}</div></div></section>}

      {screen === "result" && analysis?.demo && <div className="mb-4 rounded-2xl border border-ice/25 bg-ice/[.06] px-4 py-2.5 text-center text-[11px] text-ice">DEMO MODU: örnek veriler gösteriliyor (API anahtarı tanımlı değil)</div>}
      {screen === "result" && analysis && <ResultsDashboard analysis={analysis} portrait={framedFrontForResult || frontPhoto} onNewAnalysis={reset} />}
    </div>
  </main>;
}
