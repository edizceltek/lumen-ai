// Tarayıcıda çalışan, bağımlılıksız PDF üretici.
// Sayfalar canvas ile çizilir (Türkçe karakterler sorunsuz), JPEG olarak PDF'e gömülür.
import type { CoachingPlan } from "./plan";

export type PdfAnalysis = {
  metrics: { overall: number; potential: number; jawline: number; cheekbones: number; skinQuality: number; eyeArea: number; symmetry: number; faceHarmony: number };
  summary: string;
  strongestFeature: string;
  improvementArea: string;
  metricObservations: Record<string, string>;
  recommendations: { category: string; recommendation: string }[];
  plan: CoachingPlan;
};

const W = 1240, H = 1754, M = 96, FOOTER = 90;
const C = { bg: "#09090B", panel: "#121216", line: "rgba(255,255,255,.10)", text: "#FAFAFA", muted: "rgba(250,250,250,.68)", dim: "rgba(250,250,250,.42)", gold: "#D4B16A", ice: "#38BDF8" };
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };
type TextOpts = { size?: number; color?: string; family?: string; weight?: string; x?: number; width?: number; lh?: number; spacing?: string; align?: CanvasTextAlign };

class PdfDoc {
  pages: HTMLCanvasElement[] = [];
  ctx!: Ctx;
  y = M;

  constructor() { this.addPage(); }

  addPage() {
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d") as Ctx | null;
    if (!ctx) throw new Error("PDF hazırlanamadı.");
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 760);
    glow.addColorStop(0, "rgba(56,189,248,.12)"); glow.addColorStop(1, "rgba(56,189,248,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
    this.pages.push(canvas); this.ctx = ctx; this.y = M;
    if (this.pages.length > 1) {
      this.text("LUMEN", { size: 22, color: C.gold, spacing: "8px", weight: "600", family: SANS });
      this.y = M;
      this.text("Kişisel Dönüşüm Planı", { size: 20, color: C.dim, align: "right", x: W - M, family: SANS });
      this.line(M, M + 44, W - M);
      this.y = M + 90;
    }
  }

  setFont(opts: TextOpts) {
    const ctx = this.ctx;
    ctx.font = `${opts.weight ?? "400"} ${opts.size ?? 26}px ${opts.family ?? SANS}`;
    ctx.letterSpacing = opts.spacing ?? "0px";
  }

  lines(text: string, opts: TextOpts = {}): string[] {
    this.setFont(opts);
    const maxWidth = opts.width ?? W - 2 * M;
    const result: string[] = [];
    for (const paragraph of text.split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const attempt = current ? `${current} ${word}` : word;
        if (current && this.ctx.measureText(attempt).width > maxWidth) { result.push(current); current = word; } else current = attempt;
      }
      result.push(current);
    }
    return result;
  }

  heightOf(text: string, opts: TextOpts = {}) {
    return this.lines(text, opts).length * (opts.size ?? 26) * (opts.lh ?? 1.5);
  }

  ensure(height: number) {
    if (this.y + height > H - M - FOOTER) this.addPage();
  }

  text(value: string, opts: TextOpts = {}) {
    const size = opts.size ?? 26, lh = size * (opts.lh ?? 1.5);
    for (const line of this.lines(value, opts)) {
      this.ensure(lh);
      this.setFont(opts);
      this.ctx.fillStyle = opts.color ?? C.muted;
      this.ctx.textAlign = opts.align ?? "left";
      this.ctx.fillText(line, opts.x ?? M, this.y);
      this.y += lh;
    }
    this.ctx.textAlign = "left";
    this.ctx.letterSpacing = "0px";
  }

  line(x1: number, y: number, x2: number, color = C.line, width = 2) {
    this.ctx.strokeStyle = color; this.ctx.lineWidth = width;
    this.ctx.beginPath(); this.ctx.moveTo(x1, y); this.ctx.lineTo(x2, y); this.ctx.stroke();
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  section(index: string, title: string, keepWithNext = 140) {
    this.ensure(190 + keepWithNext);
    this.y += 36;
    this.text(`${index}`, { size: 22, color: C.gold, spacing: "6px", weight: "600", family: SANS });
    this.text(title, { size: 46, color: C.text, family: SERIF, lh: 1.25 });
    this.line(M, this.y + 6, M + 90, C.gold, 3);
    this.y += 34;
  }

  steps(items: string[]) {
    const size = 26, textX = M + 72, width = W - M - textX;
    items.forEach((item, i) => {
      const h = Math.max(54, this.heightOf(item, { size, width }));
      this.ensure(h + 22);
      const ctx = this.ctx;
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(M + 25, this.y + 22, 24, 0, Math.PI * 2); ctx.stroke();
      this.setFont({ size: 24, weight: "600" });
      ctx.fillStyle = C.gold; ctx.textAlign = "center"; ctx.fillText(String(i + 1), M + 25, this.y + 9); ctx.textAlign = "left";
      const startY = this.y;
      this.text(item, { size, x: textX, width, color: C.muted });
      this.y = startY + h + 22;
    });
  }

  ring(cx: number, cy: number, r: number, value: number, color: string, label: string) {
    const ctx = this.ctx;
    ctx.lineWidth = 16; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,.09)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * value) / 100); ctx.stroke();
    ctx.lineCap = "butt";
    this.setFont({ size: 92, family: SERIF });
    ctx.fillStyle = C.text; ctx.textAlign = "center"; ctx.fillText(String(value), cx, cy - 60);
    this.setFont({ size: 22, family: SANS });
    ctx.fillStyle = C.dim; ctx.fillText("/ 100", cx, cy + 38);
    this.setFont({ size: 22, weight: "600", spacing: "4px" });
    ctx.fillStyle = C.muted; ctx.fillText(label, cx, cy + r + 38);
    ctx.textAlign = "left"; ctx.letterSpacing = "0px";
  }

  finalize(): HTMLCanvasElement[] {
    const total = this.pages.length;
    this.pages.forEach((canvas, i) => {
      const ctx = canvas.getContext("2d") as Ctx;
      ctx.textBaseline = "top";
      ctx.strokeStyle = C.line; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(M, H - M - 36); ctx.lineTo(W - M, H - M - 36); ctx.stroke();
      ctx.font = `400 19px ${SANS}`; ctx.fillStyle = C.dim;
      ctx.textAlign = "left"; ctx.fillText("Lumen AI · Bu plan genel bilgilendirme amaçlıdır, tıbbi tavsiye değildir.", M, H - M - 14);
      ctx.textAlign = "right"; ctx.fillText(`Sayfa ${i + 1} / ${total}`, W - M, H - M - 14);
    });
    return this.pages;
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image); image.onerror = () => reject(new Error("Görsel yüklenemedi."));
    image.src = src;
  });
}

const metricRows = [
  ["jawline", "Çene Hattı"], ["cheekbones", "Elmacık Kemikleri"], ["skinQuality", "Cilt Kalitesi"],
  ["eyeArea", "Göz Bölgesi"], ["symmetry", "Yüz Simetrisi"], ["faceHarmony", "Yüz Uyumu"],
] as const;

async function renderPages(analysis: PdfAnalysis, portrait?: string) {
  const doc = new PdfDoc();
  const { metrics, plan } = analysis;

  // --- Kapak ---
  doc.text("LUMEN", { size: 30, color: C.gold, spacing: "12px", weight: "600" });
  doc.y = M;
  doc.text(new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }), { size: 22, color: C.dim, align: "right", x: W - M });
  doc.y = M + 150;
  doc.text("LUMEN AI  ·  KİŞİSEL KOÇLUK PLANI", { size: 22, color: C.ice, spacing: "7px", weight: "600" });
  doc.y += 14;
  doc.text("Dönüşüm\nPlanın", { size: 96, color: C.text, family: SERIF, lh: 1.08, width: 700 });
  doc.line(M, doc.y + 20, M + 120, C.gold, 3);
  if (portrait) {
    try {
      const image = await loadImage(portrait);
      const cx = W - M - 130, cy = M + 330, r = 130;
      doc.ctx.save(); doc.ctx.beginPath(); doc.ctx.arc(cx, cy, r, 0, Math.PI * 2); doc.ctx.clip();
      const scale = Math.max((r * 2) / image.width, (r * 2) / image.height);
      doc.ctx.drawImage(image, cx - (image.width * scale) / 2, cy - (image.height * scale) / 2, image.width * scale, image.height * scale);
      doc.ctx.restore();
      doc.ctx.strokeStyle = C.gold; doc.ctx.lineWidth = 4; doc.ctx.beginPath(); doc.ctx.arc(cx, cy, r + 10, 0, Math.PI * 2); doc.ctx.stroke();
    } catch { /* portre isteğe bağlı */ }
  }
  doc.y = Math.max(doc.y, M + 560) + 40;
  doc.ring(W * 0.3, doc.y + 150, 110, metrics.overall, C.ice, "GENEL SKOR");
  doc.ring(W * 0.7, doc.y + 150, 110, metrics.potential, C.gold, "POTANSİYEL");
  doc.y += 150 + 110 + 110;

  doc.text(`Güçlü yanın: ${analysis.strongestFeature}`, { size: 28, color: C.text, family: SERIF });
  doc.y += 6;
  doc.text(`Odak alanın: ${analysis.improvementArea}`, { size: 28, color: C.text, family: SERIF });
  doc.y += 14;
  doc.text(analysis.summary, { size: 23, color: C.dim });

  // --- 01 Metrikler ve gözlemler ---
  doc.addPage();
  doc.section("01", "Yüz & Cilt Gözlemleri");
  for (const [key, label] of metricRows) {
    const value = metrics[key];
    const note = analysis.metricObservations[key] || "";
    doc.ensure(60 + doc.heightOf(note, { size: 23 }) + 40);
    doc.text(label, { size: 28, color: C.text, weight: "600" });
    doc.ctx.textAlign = "right"; doc.setFont({ size: 28, family: SERIF }); doc.ctx.fillStyle = C.gold; doc.ctx.fillText(`${value} / 100`, W - M, doc.y - 42); doc.ctx.textAlign = "left";
    doc.y += 4;
    doc.roundRect(M, doc.y, W - 2 * M, 14, 7, "rgba(255,255,255,.09)");
    const gradient = doc.ctx.createLinearGradient(M, 0, W - M, 0); gradient.addColorStop(0, "rgba(56,189,248,.6)"); gradient.addColorStop(1, "#FAFAFA");
    doc.roundRect(M, doc.y, Math.max(14, ((W - 2 * M) * value) / 100), 14, 7, undefined);
    doc.ctx.fillStyle = gradient; doc.ctx.fill();
    doc.y += 34;
    doc.text(note, { size: 23, color: C.muted });
    doc.y += 26;
  }

  // --- 02 Rutinler ---
  doc.section("02", "Sabah Bakım Rutini");
  doc.steps(plan.morningRoutine);
  doc.section("03", "Akşam Bakım Rutini");
  doc.steps(plan.eveningRoutine);

  // --- 04 Saç & Sakal ---
  doc.section("04", "Saç & Sakal Önerileri");
  doc.steps(plan.hairBeard);

  // --- 05 Kişisel öneriler ---
  doc.section("05", "Kişisel Öneriler", 220);
  for (const item of analysis.recommendations) {
    const h = 44 + doc.heightOf(item.recommendation, { size: 24, width: W - 2 * M - 64 }) + 48;
    doc.ensure(h + 20);
    doc.roundRect(M, doc.y, W - 2 * M, h, 22, C.panel, C.line);
    const top = doc.y;
    doc.y = top + 24;
    doc.text(item.category.toUpperCase(), { size: 20, color: C.gold, spacing: "4px", weight: "600", x: M + 32 });
    doc.y += 4;
    doc.text(item.recommendation, { size: 24, color: C.muted, x: M + 32, width: W - 2 * M - 64 });
    doc.y = top + h + 20;
  }

  // --- 06 30 günlük hedefler ---
  doc.section("06", "30 Günlük Gelişim Hedefleri", 300);
  for (const week of plan.thirtyDayGoals) {
    const goalW = W - 2 * M - 64 - 56;
    const goalsH = week.goals.reduce((sum, goal) => sum + doc.heightOf(goal, { size: 24, width: goalW }) + 14, 0);
    const h = 40 + 58 + goalsH + 26;
    doc.ensure(h + 20);
    doc.roundRect(M, doc.y, W - 2 * M, h, 22, C.panel, C.line);
    const top = doc.y;
    doc.y = top + 30;
    doc.text(`${week.week.toUpperCase()}  ·  ${week.title}`, { size: 28, color: C.text, family: SERIF, x: M + 32 });
    doc.y += 14;
    for (const goal of week.goals) {
      doc.ctx.strokeStyle = C.gold; doc.ctx.lineWidth = 2.5; doc.ctx.strokeRect(M + 34, doc.y + 4, 26, 26);
      doc.text(goal, { size: 24, color: C.muted, x: M + 32 + 56, width: goalW });
      doc.y += 14;
    }
    doc.y = top + h + 20;
  }

  doc.y += 10;
  doc.text("Planı 30 gün sonunda aynı ışık ve açıyla çekeceğin yeni bir fotoğrafla ve Lumen AI'da yeniden analizle değerlendir. Cilt veya sağlık sorunların varsa uygulamadan önce bir dermatolog / hekimle görüş.", { size: 21, color: C.dim });

  return doc.finalize();
}

function base64ToBytes(dataUrl: string) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildPdf(jpegs: { bytes: Uint8Array; width: number; height: number }[]) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const data = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
    chunks.push(data); length += data.length;
  };
  const object = (id: number, body: () => void) => { offsets[id] = length; push(`${id} 0 obj\n`); body(); push("\nendobj\n"); };

  const pageW = 595.28, pageH = 841.89;
  const pageIds = jpegs.map((_, i) => 3 + i * 3);
  push("%PDF-1.4\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${jpegs.length} >>`));
  jpegs.forEach((jpeg, i) => {
    const pageId = 3 + i * 3, contentId = pageId + 1, imageId = pageId + 2;
    object(pageId, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    object(contentId, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(imageId, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${jpeg.width} /Height ${jpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.bytes.length} >>\nstream\n`);
      push(jpeg.bytes); push("\nendstream");
    });
  });
  const count = 3 + jpegs.length * 3;
  const xrefStart = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const output = new Uint8Array(length);
  let position = 0;
  for (const chunk of chunks) { output.set(chunk, position); position += chunk.length; }
  return output;
}

export async function downloadPlanPdf(analysis: PdfAnalysis, portrait?: string, fileName = "lumen-kisisel-plan.pdf") {
  const pages = await renderPages(analysis, portrait);
  const jpegs = pages.map((canvas) => ({ bytes: base64ToBytes(canvas.toDataURL("image/jpeg", 0.92)), width: canvas.width, height: canvas.height }));
  const blob = new Blob([buildPdf(jpegs) as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = fileName;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}