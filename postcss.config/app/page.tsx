"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { ResultsDashboard, type AnalysisResult } from "./components/ResultsDashboard";

type Screen = "landing" | "upload" | "scan" | "result";

const scanSteps = [
  "Yüz simetrisi ölçülüyor...",
  "Çene hattı ve elmacık kemikleri taranıyor...",
  "Cilt dokusu ve göz bölgesi analiz ediliyor...",
];

const DAILY_LIMIT = 3;
const QUOTA_STORAGE_KEY = "aura-analiz-kullanimi";

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
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("Fotoğraf okunamadı.")); element.src = source; });
    const width = Math.min(image.width, 800);
    const height = Math.round(image.height * (width / image.width));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Fotoğraf hazırlanamadı.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally { URL.revokeObjectURL(source); }
}


const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateImageFile(file: File) {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Lütfen JPG, PNG veya WebP formatında bir fotoğraf seç.";
  if (file.size > 10 * 1024 * 1024) return "Fotoğraf 10 MB'tan küçük olmalı.";
  return undefined;
}

// Test amaçlı: dosya gerektirmeyen, çizilmiş örnek bir yüz görseli (JPEG data URL).
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
    canvas.width = 800; canvas.height = 1000;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Örnek görsel oluşturulamadı.");
    context.drawImage(image, 0, 0, 800, 1000);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}

function Icon({ name, className = "" }: { name: "shield" | "arrow" | "camera" | "image" | "check" | "spark" | "back"; className?: string }) {
  const paths = {
    shield: <path d="M12 2.8 20 6v5.1c0 4.8-3.25 8.75-8 10.1-4.75-1.35-8-5.3-8-10.1V6l8-3.2Z" />,
    arrow: <><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>,
    camera: <><path d="M4 7.8h3l1.5-2h7l1.5 2h3v10.8H4Z" /><circle cx="12" cy="13.2" r="3.1" /></>,
    image: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="8.3" cy="9" r="1.2" /><path d="m4 17 4.7-4.7 3.1 3.1 2.1-2.1L20 19" /></>,
    check: <path d="m5 12.4 4.2 4.1L19.5 6.2" />,
    spark: <path d="M12 2.5c.85 5.95 2.05 7.15 8 8-5.95.85-7.15 2.05-8 8-.85-5.95-2.05-7.15-8-8 5.95-.85 7.15-2.05 8-8Z" />,
    back: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Logo() {
  return <div className="flex items-center gap-2.5"><div className="grid size-7 place-items-center rounded-[9px] border border-white/20 bg-white/[.08]"><span className="h-2.5 w-2.5 rounded-full border border-ice bg-ice/20" /></div><span className="text-[13px] font-semibold tracking-[.24em] text-white/90">AURA</span></div>;
}

function FaceGuide() {
  return <><div className="pointer-events-none absolute left-1/2 top-1/2 h-[74%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border border-dashed border-white/35" /><div className="pointer-events-none absolute left-1/2 top-[13%] h-[74%] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/20 to-transparent" /></>;
}

function UploadSlot({ title, optional, image, onFile, camera }: { title: string; optional?: boolean; image?: string; onFile: (file: File) => void; camera?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [useCapture, setUseCapture] = useState(false);
  useEffect(() => { setUseCapture(Boolean(camera) && window.matchMedia("(pointer: coarse)").matches); }, [camera]);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // aynı dosyayı tekrar seçebilmek için
    if (file) onFile(file);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`overflow-hidden rounded-[22px] border bg-white/[.025] transition ${dragging ? "border-ice/70 bg-ice/[.06]" : "border-white/[.09]"}`}>
    <input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture={useCapture ? "user" : undefined} onChange={handleChange} />
    <button type="button" onClick={() => inputRef.current?.click()} className="relative block aspect-[1.22/1] w-full overflow-hidden text-left transition active:scale-[.99]">
      {image ? <img src={image} alt={`${title} önizlemesi`} className="h-full w-full object-cover opacity-80" /> : <div className="h-full w-full bg-[radial-gradient(circle_at_50%_30%,rgba(56,189,248,.12),transparent_45%)]" />}
      <FaceGuide />
      {!image && <div className="absolute inset-0 grid place-items-center"><div className="flex flex-col items-center gap-2"><div className="grid size-11 place-items-center rounded-full border border-white/15 bg-black/20 text-white/70"><Icon name={useCapture ? "camera" : "image"} className="size-5" /></div><span className="hidden text-[11px] text-white/45 md:block">{dragging ? "Bırak" : "Tıkla veya JPG / PNG sürükle"}</span></div></div>}
      {image && <div className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-ice text-obsidian"><Icon name="check" className="size-4" /></div>}
    </button>
    <div className="flex items-center justify-between px-4 py-3.5"><span className="text-sm font-medium text-white/90">{title}</span><span className="text-[11px] text-white/40">{optional ? "İsteğe bağlı" : "Gerekli"}</span></div>
  </div>;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [frontPhoto, setFrontPhoto] = useState<string>();
  const [profilePhoto, setProfilePhoto] = useState<string>();
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
        const payload = await response.json() as AnalysisResult & { error?: string; quotaExceeded?: boolean; remainingQuota?: number };
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
      if (target === "front") { setFrontPhoto(compressed); setFrontImage(compressed); }
      else { setProfilePhoto(compressed); setSideImage(compressed); }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Fotoğraf okunamadı.");
    }
  };
  const quickTest = async () => {
    try {
      setFileError(undefined);
      const sample = await createSampleFace();
      setFrontPhoto(sample); setFrontImage(sample);
      setProfilePhoto(undefined); setSideImage(undefined);
      setScreen("scan");
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Örnek görsel oluşturulamadı.");
    }
  };
  const reset = () => { setFrontPhoto(undefined); setProfilePhoto(undefined); setFrontImage(undefined); setSideImage(undefined); setAnalysis(undefined); setAnalysisError(undefined); setScreen("landing"); };
  const resetTestQuota = async () => {
    await fetch("/api/analyze", { method: "DELETE" });
    window.localStorage.removeItem(QUOTA_STORAGE_KEY);
    setRemainingQuota(DAILY_LIMIT); setQuotaReached(false);
  };

  return <main className="min-h-dvh overflow-hidden bg-obsidian">
    <div className="noise pointer-events-none fixed inset-0 opacity-30" />
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[460px] flex-col px-5 pb-6 pt-6">
      {screen === "landing" && <section className="flex min-h-[calc(100dvh-48px)] flex-col fade-up">
        <header className="flex items-center justify-between"><Logo /><span className="rounded-full border border-white/[.08] px-3 py-1.5 text-[10px] font-medium tracking-wide text-white/45">BETA</span></header>
        <div className="flex flex-1 flex-col justify-center pb-10 pt-12">
          <div className="mb-8 flex items-center gap-2 text-xs text-ice"><span className="h-px w-7 bg-ice/70" /> BİYOMETRİK YÜZ ANALİZİ</div>
          <h1 className="max-w-[380px] text-[44px] font-medium leading-[1.04] tracking-[-.055em] text-white">Yüz Potansiyelini <span className="text-white/45">Keşfet</span></h1>
          <p className="mt-5 max-w-[330px] text-[15px] leading-6 text-white/48">Yüz oranlarını ve öne çıkan özelliklerini modern bir bakış açısıyla incele.</p>
          <div className="relative mx-auto mt-10 aspect-square w-[250px] rounded-full border border-white/[.09] bg-[radial-gradient(circle_at_50%_38%,rgba(56,189,248,.16),transparent_35%),radial-gradient(circle_at_50%_50%,#1b1b21,transparent_68%)]">
            <div className="absolute inset-[14%] rounded-full border border-white/[.12]" />
            <div className="absolute inset-[27%] rounded-full border border-ice/35" />
            <div className="absolute left-1/2 top-1/2 h-[52%] w-[31%] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border border-white/30" />
            <div className="absolute left-[22%] top-1/2 h-px w-[56%] bg-ice/50" />
            <div className="absolute bottom-[21%] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-ice shadow-[0_0_18px_4px_rgba(56,189,248,.35)]" />
          </div>
        </div>
        <div className="space-y-3"><div className="flex items-center justify-center gap-2 text-[11px] text-white/42"><Icon name="shield" className="size-3.5 text-ice" /> Fotoğrafların sunucuda saklanmaz</div><p className="text-center text-[11px] text-white/42">Tamamen ücretsiz · tüm skorlar ve öneriler açık · günde 3 analiz</p><button onClick={() => setScreen("upload")} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#FAFAFA] text-sm font-semibold text-[#09090B] transition hover:bg-white active:scale-[.985]">Analize Başla <Icon name="arrow" className="size-[18px]" /></button></div>
      </section>}

      {screen === "upload" && <section className="fade-up"><header className="mb-8 flex items-center justify-between"><button aria-label="Geri dön" onClick={() => setScreen("landing")} className="grid size-10 place-items-center rounded-full border border-white/[.09] text-white/75"><Icon name="back" className="size-5" /></button><Logo /><span className="w-10" /></header><div className="mb-7"><p className="text-[11px] font-medium tracking-[.16em] text-ice">ADIM 01 / 02</p><h1 className="mt-2 text-[30px] font-medium tracking-[-.045em]">Net fotoğraflar ekle</h1><p className="mt-2 text-sm leading-5 text-white/45">Daha dengeli bir analiz için yüzünü çerçeveye hizala.</p></div><div className="glass mb-4 flex items-center justify-between rounded-2xl px-4 py-3"><div><p className="text-[11px] text-white/42">Kalan Günlük Analiz Hakkı</p><p className="mt-1 font-mono text-sm tabular-nums text-ice">{remainingQuota}/3</p></div><div className="flex gap-1.5">{Array.from({ length: 3 }).map((_, index) => <span key={index} className={`size-2 rounded-full ${index < remainingQuota ? "bg-ice" : "bg-white/15"}`} />)}</div></div>{quotaReached || remainingQuota === 0 ? <div className="glass rounded-[22px] p-5 text-center"><p className="text-sm leading-6 text-white/78">Günlük ücretsiz analiz tokenların bitti. Yarın yeni haklarınla tekrar analiz yapabilirsin.</p>{isLocalhost && <button onClick={() => void resetTestQuota()} className="mt-4 text-xs font-medium text-ice">Test Hakkını Sıfırla</button>}</div> : <><div className="space-y-4"><UploadSlot title="Önden Görünüm" image={frontPhoto} onFile={(file) => void loadFile(file, "front")} camera /><UploadSlot title="Yan Profil" optional image={profilePhoto} onFile={(file) => void loadFile(file, "side")} /></div><div className="glass mt-5 flex gap-3 rounded-2xl p-4"><div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-ice/10 text-ice"><Icon name="spark" className="size-3.5" /></div><p className="text-[12px] leading-5 text-white/53">Doğal ışıkta, kameraya düz bakarak çek. Gözlük, şapka ve yoğun filtre kullanma.</p></div>{fileError && <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-[12px] leading-5 text-red-200/90">{fileError}</p>}<button disabled={!frontImage} onClick={() => setScreen("scan")} className="mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white text-sm font-semibold text-obsidian transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30 active:scale-[.985]">Yüzümü Analiz Et <Icon name="arrow" className="size-[18px]" /></button>{isLocalhost && <button type="button" onClick={() => void quickTest()} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ice/40 text-[13px] font-medium text-ice transition hover:bg-ice/[.06] active:scale-[.985]"><Icon name="spark" className="size-4" /> Örnek Fotoğrafla Hızlı Test Et</button>}</>}</section>}

      {screen === "scan" && <section className="flex min-h-[calc(100dvh-48px)] flex-col fade-up"><header className="flex justify-center"><Logo /></header><div className="flex flex-1 flex-col justify-center"><div className="relative mx-auto aspect-[.8] w-full max-w-[315px] overflow-hidden rounded-[30px] border border-white/[.12] bg-surface">{frontPhoto && <img src={frontPhoto} alt="Analiz edilen yüz" className="h-full w-full object-cover opacity-70 grayscale-[.15]" />}<div className="absolute inset-0 bg-gradient-to-b from-ice/[.03] via-transparent to-ice/[.08]" /><FaceGuide />{!analysisError && <><div className="scan-line absolute left-0 right-0 z-10 h-px bg-ice shadow-[0_0_18px_3px_rgba(56,189,248,.85)]" /><div className="absolute left-0 right-0 h-20 bg-gradient-to-b from-ice/[.16] to-transparent scan-line" /></>}</div><div className="mt-9 text-center">{analysisError ? <div className="glass rounded-2xl p-5"><p className="text-sm leading-6 text-white/75">{analysisError}</p><button onClick={() => setScreen("upload")} className="mt-4 text-sm font-medium text-ice">Fotoğrafları düzenle</button></div> : <><div className="mx-auto mb-5 flex justify-center gap-1.5">{scanSteps.map((_, index) => <span key={index} className={`h-1 rounded-full transition-all duration-500 ${index === step ? "w-6 bg-ice" : "w-1 bg-white/20"}`} />)}</div><p className="h-6 text-sm text-white/75 transition-all" key={step}>{scanSteps[step]}</p><p className="mt-2 text-[11px] text-white/35">Bu işlem birkaç saniye sürebilir</p></>}</div></div></section>}

      {screen === "result" && analysis?.demo && <div className="mb-4 rounded-2xl border border-ice/25 bg-ice/[.06] px-4 py-2.5 text-center text-[11px] text-ice">DEMO MODU: örnek veriler gösteriliyor (API anahtarı tanımlı değil)</div>}
      {screen === "result" && analysis && <ResultsDashboard analysis={analysis} portrait={frontPhoto} onNewAnalysis={reset} />}
    </div>
  </main>;
}

