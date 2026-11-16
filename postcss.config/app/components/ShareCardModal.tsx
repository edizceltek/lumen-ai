"use client";

import { useEffect, useState } from "react";
import type { AnalysisResult } from "./ResultsDashboard";

type ShareCardModalProps = { analysis: AnalysisResult; portrait?: string; onClose: () => void };

const metrics = [
  ["ÇENE HATTI", "jawline"], ["ELMACIK KEMİKLERİ", "cheekbones"], ["CİLT KALİTESİ", "skinQuality"],
  ["GÖZ BÖLGESİ", "eyeArea"], ["YÜZ SİMETRİSİ", "symmetry"], ["YÜZ UYUMU", "faceHarmony"],
] as const;

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const imageRatio = image.width / image.height;
  const boxRatio = width / height;
  let sourceWidth = image.width; let sourceHeight = image.height; let sourceX = 0; let sourceY = 0;
  if (imageRatio > boxRatio) { sourceWidth = image.height * boxRatio; sourceX = (image.width - sourceWidth) / 2; }
  else { sourceHeight = image.width / boxRatio; sourceY = (image.height - sourceHeight) / 2; }
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

async function makeShareCard(analysis: AnalysisResult, portrait?: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Görsel oluşturulamadı.");
  context.fillStyle = "#09090B"; context.fillRect(0, 0, 1080, 1920);
  const glow = context.createRadialGradient(540, 440, 30, 540, 440, 650);
  glow.addColorStop(0, "rgba(56,189,248,.22)"); glow.addColorStop(.42, "rgba(56,189,248,.06)"); glow.addColorStop(1, "rgba(9,9,11,0)");
  context.fillStyle = glow; context.fillRect(0, 0, 1080, 1100);
  context.fillStyle = "#38BDF8"; context.font = "600 22px Arial"; context.fillText("AURA  •  YÜZ ANALİZİ", 100, 118);
  context.fillStyle = "#FAFAFA"; context.font = "600 58px Arial"; context.fillText("Skor Kartın", 100, 205);
  context.fillStyle = "rgba(250,250,250,.48)"; context.font = "400 25px Arial"; context.fillText("Kişisel gelişim özetin", 100, 250);

  context.save(); context.beginPath(); context.arc(540, 570, 235, 0, Math.PI * 2); context.clip();
  if (portrait) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const next = new Image(); next.onload = () => resolve(next); next.onerror = reject; next.src = portrait; });
    drawCover(context, image, 305, 335, 470, 470);
  } else { context.fillStyle = "#17171d"; context.fillRect(305, 335, 470, 470); }
  context.restore();
  context.strokeStyle = "rgba(250,250,250,.35)"; context.lineWidth = 2; context.beginPath(); context.arc(540, 570, 244, 0, Math.PI * 2); context.stroke();
  context.strokeStyle = "rgba(56,189,248,.55)"; context.lineWidth = 2; context.beginPath(); context.arc(540, 570, 260, -.4, 1.5); context.stroke();

  const drawBadge = (x: number, value: number, label: string, outline: string) => {
    roundedRect(context, x, 900, 410, 210, 34); context.fillStyle = "rgba(18,18,22,.9)"; context.fill(); context.strokeStyle = outline; context.lineWidth = 2; context.stroke();
    context.fillStyle = "#FAFAFA"; context.font = "600 76px Arial"; context.textAlign = "center"; context.fillText(String(value), x + 205, 985);
    context.fillStyle = "rgba(250,250,250,.5)"; context.font = "600 18px Arial"; context.fillText(label, x + 205, 1045); context.textAlign = "left";
  };
  drawBadge(100, analysis.metrics.overall, "GENEL SKOR", "rgba(56,189,248,.75)");
  drawBadge(570, analysis.metrics.potential, "POTANSİYEL", "rgba(250,250,250,.45)");

  context.fillStyle = "#FAFAFA"; context.font = "600 32px Arial"; context.fillText("Yüz metriklerin", 100, 1215);
  metrics.forEach(([label, metric], index) => {
    const column = index % 2; const row = Math.floor(index / 2); const x = 100 + column * 450; const y = 1260 + row * 145;
    roundedRect(context, x, y, 430, 118, 22); context.fillStyle = "#121216"; context.fill(); context.strokeStyle = "rgba(250,250,250,.09)"; context.lineWidth = 1; context.stroke();
    context.fillStyle = "rgba(250,250,250,.52)"; context.font = "600 15px Arial"; context.fillText(label, x + 24, y + 42);
    context.fillStyle = "#FAFAFA"; context.font = "600 38px Arial"; context.textAlign = "right"; context.fillText(String(analysis.metrics[metric]), x + 398, y + 52); context.textAlign = "left";
    roundedRect(context, x + 24, y + 80, 382, 7, 4); context.fillStyle = "rgba(250,250,250,.09)"; context.fill();
    roundedRect(context, x + 24, y + 80, 382 * (analysis.metrics[metric] / 100), 7, 4); const bar = context.createLinearGradient(x, y, x + 382, y); bar.addColorStop(0, "#38BDF8"); bar.addColorStop(1, "#FAFAFA"); context.fillStyle = bar; context.fill();
  });
  context.strokeStyle = "rgba(250,250,250,.1)"; context.beginPath(); context.moveTo(100, 1760); context.lineTo(980, 1760); context.stroke();
  context.fillStyle = "rgba(250,250,250,.36)"; context.font = "400 20px Arial"; context.fillText("Kişisel gelişim yolculuğun için", 100, 1822);
  context.fillStyle = "#38BDF8"; context.font = "600 23px Arial"; context.fillText("AURA", 100, 1870);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG oluşturulamadı.")), "image/png"));
}

export function ShareCardModal({ analysis, portrait, onClose }: ShareCardModalProps) {
  const [blob, setBlob] = useState<Blob>(); const [preview, setPreview] = useState<string>(); const [error, setError] = useState<string>();
  useEffect(() => { let active = true; let objectUrl: string | undefined; makeShareCard(analysis, portrait).then((next) => { if (!active) return; objectUrl = URL.createObjectURL(next); setBlob(next); setPreview(objectUrl); }).catch(() => active && setError("Kart oluşturulamadı. Lütfen tekrar dene.")); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [analysis, portrait]);
  const download = () => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aura-sonuc-karti.png"; link.click(); URL.revokeObjectURL(url); };
  const share = async () => { if (!blob) return; const file = new File([blob], "aura-sonuc-karti.png", { type: "image/png" }); if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) { await navigator.share({ title: "AURA Yüz Analizi", text: "AURA sonuç kartım", files: [file] }); } else download(); };
  return <div role="dialog" aria-modal="true" aria-label="Skor kartı önizlemesi" className="fixed inset-0 z-50 flex items-end bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"><div className="w-full max-w-[430px] rounded-t-[30px] border border-white/[.1] bg-[#121216] p-5 sm:rounded-[30px]"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-medium">Hikâye kartın</p><p className="mt-1 text-[11px] text-white/42">1080 × 1920 • PNG</p></div><button onClick={onClose} className="grid size-9 place-items-center rounded-full border border-white/[.1] text-white/65" aria-label="Kapat">×</button></div><div className="grid aspect-[9/16] max-h-[58vh] place-items-center overflow-hidden rounded-2xl bg-obsidian">{preview ? <img src={preview} alt="Skor kartı önizlemesi" className="h-full w-full object-contain" /> : <span className="text-xs text-white/45">Kart hazırlanıyor...</span>}{error && <span className="text-xs text-red-200">{error}</span>}</div><div className="mt-4 grid grid-cols-2 gap-3"><button onClick={download} disabled={!blob} className="h-12 rounded-xl border border-white/[.14] text-sm font-medium text-white disabled:opacity-40">Görseli İndir (PNG)</button><button onClick={() => void share()} disabled={!blob} className="h-12 rounded-xl bg-white text-sm font-semibold text-obsidian disabled:opacity-40">Paylaş</button></div></div></div>;
}
