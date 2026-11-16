"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "./ResultsDashboard";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

async function renderScoreCard(analysis: AnalysisResult, portrait?: string): Promise<string> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Skor kartı oluşturulamadı.");

  const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';

  // Arka plan
  ctx.fillStyle = "#07080B";
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.5, 220, 40, W * 0.5, 220, 820);
  glow.addColorStop(0, "rgba(56, 189, 248, 0.16)");
  glow.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Üst Marka Başlığı
  ctx.textBaseline = "top";
  ctx.fillStyle = "#FAFAFA";
  ctx.font = `700 34px ${SANS}`;
  ctx.fillText("L U M E N", 76, 76);

  ctx.textAlign = "right";
  ctx.fillStyle = "#38BDF8";
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText("BİYOMETRİK YÜZ ANALİZİ", W - 76, 84);
  ctx.textAlign = "left";

  // Portre veya Merkez Rozet
  let topCursor = 175;
  if (portrait) {
    try {
      const img = await loadImage(portrait);
      const cx = W / 2;
      const cy = 285;
      const r = 105;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.max((r * 2) / img.width, (r * 2) / img.height);
      ctx.drawImage(
        img,
        cx - (img.width * scale) / 2,
        cy - (img.height * scale) / 2,
        img.width * scale,
        img.height * scale
      );
      ctx.restore();

      ctx.strokeStyle = "#38BDF8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
      ctx.stroke();
      topCursor = 425;
    } catch {
      topCursor = 185;
    }
  }

  // Ana Skor Kartı (Mevcut & Potansiyel)
  roundRect(ctx, 76, topCursor, W - 152, 230, 32, "rgba(255,255,255,0.035)", "rgba(255,255,255,0.12)");

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText("MEVCUT SKOR", W * 0.31, topCursor + 36);

  ctx.fillStyle = "#38BDF8";
  ctx.font = `600 94px ${SERIF}`;
  ctx.fillText(String(analysis.metrics.overall), W * 0.31, topCursor + 72);

  // Orta ayırıcı çizgi
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, topCursor + 36);
  ctx.lineTo(W / 2, topCursor + 194);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText("POTANSİYEL", W * 0.69, topCursor + 36);

  ctx.fillStyle = "#FAFAFA";
  ctx.font = `600 94px ${SERIF}`;
  ctx.fillText(String(analysis.metrics.potential), W * 0.69, topCursor + 72);
  ctx.textAlign = "left";

  // 12 Metrik Başlığı
  const gridTop = topCursor + 268;
  ctx.fillStyle = "#38BDF8";
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText("12 ALANLIK DETAYLI PROFİL", 76, gridTop);

  const m = analysis.metrics;
  const allTwelve: [string, number][] = [
    ["Çene Hattı", m.jawline],
    ["Elmacık Kemikleri", m.cheekbones],
    ["Cilt Kalitesi", m.skinQuality],
    ["Göz Bölgesi", m.eyeArea],
    ["Yüz Simetrisi", m.symmetry],
    ["Yüz Uyumu", m.faceHarmony],
    ["Kaş Yapısı", m.eyebrows ?? Math.min(96, m.eyeArea - 2)],
    ["Burun Oranı", m.noseRatio ?? Math.min(95, m.faceHarmony - 1)],
    ["Dudak & Ağız", m.lipsMouth ?? Math.min(95, m.symmetry)],
    ["Saç Çizgisi", m.hairline ?? Math.min(94, m.faceHarmony - 2)],
    ["Yüz Keskinliği", m.facialLeanness ?? Math.min(94, m.jawline - 1)],
    ["Boyun & Duruş", m.neckPosture ?? Math.min(95, m.jawline)],
  ];

  // 2 Sütun × 6 Satır = 12 Metrik
  const colGap = 24;
  const rowGap = 18;
  const cardW = (W - 152 - colGap) / 2;
  const cardH = 112;
  const startY = gridTop + 42;

  allTwelve.forEach(([label, score], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 76 + col * (cardW + colGap);
    const y = startY + row * (cardH + rowGap);

    roundRect(ctx, x, y, cardW, cardH, 20, "rgba(255,255,255,0.03)", "rgba(255,255,255,0.09)");

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `500 22px ${SANS}`;
    ctx.fillText(label, x + 24, y + 22);

    ctx.textAlign = "right";
    ctx.fillStyle = "#FAFAFA";
    ctx.font = `700 28px ${SANS}`;
    ctx.fillText(`${score}`, x + cardW - 24, y + 18);
    ctx.textAlign = "left";

    // İlerleme çubuğu
    const barX = x + 24;
    const barY = y + 72;
    const barW = cardW - 48;
    roundRect(ctx, barX, barY, barW, 12, 6, "rgba(255,255,255,0.09)");
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, "#38BDF8");
    grad.addColorStop(1, "#FAFAFA");
    roundRect(ctx, barX, barY, Math.max(12, (barW * score) / 100), 12, 6, undefined);
    ctx.fillStyle = grad;
    ctx.fill();
  });

  // High-ROI & Alt Bilgi Kutusu
  const bottomBoxY = startY + 6 * (cardH + rowGap) + 16;
  if (bottomBoxY + 130 < H - 80) {
    roundRect(ctx, 76, bottomBoxY, W - 152, 128, 24, "rgba(56,189,248,0.08)", "rgba(56,189,248,0.3)");
    ctx.fillStyle = "#38BDF8";
    ctx.font = `700 18px ${SANS}`;
    ctx.fillText("ODAK ALANI · EN YÜKSEK KALDIRAÇ", 104, bottomBoxY + 24);

    ctx.fillStyle = "#FAFAFA";
    ctx.font = `500 24px ${SANS}`;
    const focusText = (analysis.highRoi?.title || analysis.improvementArea || "Cilt & Çene Hattı Netliği").slice(0, 56);
    ctx.fillText(focusText, 104, bottomBoxY + 62);
  }

  // Alt Marka İmzası
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = `500 20px ${SANS}`;
  ctx.fillText("Lumen AI · Kişisel Yüz Potansiyeli Analizi", W / 2, H - 64);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

export function ShareCardModal({
  analysis,
  portrait,
  onClose,
}: {
  analysis: AnalysisResult;
  portrait?: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    renderScoreCard(analysis, portrait)
      .then((url) => {
        if (mountedRef.current) setDataUrl(url);
      })
      .catch((err) => {
        if (mountedRef.current) setError(err instanceof Error ? err.message : "Kart oluşturulamadı.");
      });
    return () => {
      mountedRef.current = false;
    };
  }, [analysis, portrait]);

  const downloadPng = () => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "lumen-skor-karti.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <div className="w-full max-w-[380px] rounded-[28px] border border-white/15 bg-[#0B0D13] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[.16em] text-ice">12 METRİK SKOR KARTI</p>
            <h3 className="text-sm font-medium text-white">Paylaşmaya Hazır</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full border border-white/15 text-xs text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="relative mx-auto aspect-[9/16] max-h-[56vh] overflow-hidden rounded-2xl border border-white/10 bg-black">
          {dataUrl ? (
            <img src={dataUrl} alt="Lumen 12 Metrik Skor Kartı" className="h-full w-full object-contain" />
          ) : error ? (
            <div className="grid h-full place-items-center p-4 text-center text-xs text-red-300">{error}</div>
          ) : (
            <div className="grid h-full place-items-center text-xs text-white/50">12 metrik kartı çiziliyor...</div>
          )}
        </div>

        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-white/15 text-xs font-medium text-white/75"
          >
            Kapat
          </button>
          <button
            type="button"
            disabled={!dataUrl}
            onClick={downloadPng}
            className="h-11 flex-1 rounded-xl bg-white text-xs font-semibold text-obsidian disabled:opacity-40"
          >
            PNG Olarak İndir
          </button>
        </div>
      </div>
    </div>
  );
}