"use client";

import { useEffect, useState } from "react";
import { ShareCardModal } from "./ShareCardModal";
import { AuraChat } from "./AuraChat";
import { buildPlan, type CoachingPlan } from "../lib/plan";
import { downloadPlanPdf } from "../lib/pdf";

export type AnalysisMetrics = {
  overall: number; potential: number; jawline: number; cheekbones: number;
  skinQuality: number; eyeArea: number; symmetry: number; faceHarmony: number;
};
export type Recommendation = { category: "Cilt Bakımı" | "Saç & Sakal Stili" | "Yüz & Duruş Egzersizleri" | "Yaşam Tarzı & Ödem Kontrolü"; recommendation: string };
export type AnalysisResult = {
  metrics: AnalysisMetrics;
  summary: string;
  strongestFeature: string;
  improvementArea: string;
  metricObservations: Record<"jawline" | "cheekbones" | "skinQuality" | "eyeArea" | "symmetry" | "faceHarmony", string>;
  recommendations: Recommendation[];
  plan?: CoachingPlan;
  remainingQuota?: number;
  demo?: boolean;
};

const habits = [
  { id: "cleanse", label: "Sabah-akşam nazik temizleyici + nemlendirici", category: "Cilt Bakımı" },
  { id: "style", label: "Yüz şekline uygun saç / sakal çizgisini koru", category: "Saç & Sakal Stili" },
  { id: "posture", label: "10 dk boyun ve duruş egzersizi", category: "Yüz & Duruş Egzersizleri" },
  { id: "water", label: "Günlük 3L su ve düşük sodyum", category: "Yaşam Tarzı & Ödem Kontrolü" },
] as const;

function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - started) / 900, 1);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown}</>;
}

function Gauge({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return <div className="flex flex-1 flex-col items-center"><div className="relative grid size-[132px] place-items-center"><svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" /><circle cx="50" cy="50" r={radius} fill="none" stroke={emphasis ? "#FAFAFA" : "#38BDF8"} strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} className="transition-[stroke-dashoffset] duration-1000 ease-out" /></svg><div className="text-center"><p className="font-mono text-3xl font-medium tracking-[-.08em] tabular-nums"><AnimatedNumber value={value} /></p><p className="mt-0.5 text-[9px] tracking-[.15em] text-white/40">/ 100</p></div></div><p className="mt-2 text-[11px] font-medium tracking-wide text-white/62">{label}</p></div>;
}

export function ResultsDashboard({ analysis, portrait, onNewAnalysis }: { analysis: AnalysisResult; portrait?: string; onNewAnalysis: () => void }) {
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Recommendation["category"]>("Cilt Bakımı");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string>();
  useEffect(() => {
    const saved = window.localStorage.getItem("aura-gunluk-aliskanliklar");
    if (saved) setChecked(JSON.parse(saved) as Record<string, boolean>);
  }, []);
  const toggleHabit = (id: string) => setChecked((previous) => {
    const next = { ...previous, [id]: !previous[id] };
    window.localStorage.setItem("aura-gunluk-aliskanliklar", JSON.stringify(next));
    return next;
  });
  const downloadPlan = async () => {
    if (pdfBusy) return;
    setPdfBusy(true); setPdfError(undefined);
    try {
      await downloadPlanPdf({ ...analysis, plan: analysis.plan ?? buildPlan(analysis) }, portrait);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "PDF oluşturulamadı. Lütfen tekrar dene.");
    } finally { setPdfBusy(false); }
  };
  const metrics = [
    ["jawline", "Çene Hattı", analysis.metrics.jawline], ["cheekbones", "Elmacık Kemikleri", analysis.metrics.cheekbones],
    ["skinQuality", "Cilt Kalitesi", analysis.metrics.skinQuality], ["eyeArea", "Göz Bölgesi", analysis.metrics.eyeArea],
    ["symmetry", "Yüz Simetrisi", analysis.metrics.symmetry], ["faceHarmony", "Yüz Uyumu", analysis.metrics.faceHarmony],
  ] as const;
  const recommendation = analysis.recommendations.find((item) => item.category === activeCategory);

  return <section className="fade-up pb-28"><div className="flex items-center justify-between"><div><p className="text-[11px] font-medium tracking-[.16em] text-ice">SONUÇLARIN HAZIR</p><h1 className="mt-1 text-[30px] font-medium tracking-[-.05em]">Yüz Analizin</h1></div><div className="grid size-10 place-items-center rounded-full border border-white/[.1] text-ice"><span className="size-2 rounded-full bg-ice shadow-[0_0_12px_3px_rgba(56,189,248,.35)]" /></div></div>
    <div className="glass mt-6 rounded-[28px] p-5"><div className="flex divide-x divide-white/[.08]"><Gauge label="GENEL SKOR" value={analysis.metrics.overall} /><Gauge label="POTANSİYEL" value={analysis.metrics.potential} emphasis /></div><div className="mt-5 border-t border-white/[.08] pt-4"><p className="text-sm leading-6 text-white/78"><span className="font-medium text-white">Güçlü yanın:</span> {analysis.strongestFeature}. <span className="font-medium text-white">Odak alanın:</span> {analysis.improvementArea}.</p><p className="mt-2 text-[12px] leading-5 text-white/42">{analysis.summary}</p></div></div>
    <div className="mt-7 flex items-end justify-between"><div><p className="text-sm font-medium">Yüz metriklerin</p><p className="mt-1 text-[11px] text-white/40">Detay için bir karta dokun</p></div><span className="text-[11px] text-ice">6 ALAN</span></div>
    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">{metrics.map(([key, title, value]) => <button key={key} onClick={() => setActiveMetric(activeMetric === key ? null : key)} className={`glass rounded-[20px] p-4 text-left transition active:scale-[.98] ${activeMetric === key ? "border-ice/45 bg-ice/[.06]" : ""}`}><div className="flex items-baseline justify-between gap-2"><span className="text-[11px] text-white/55">{title}</span><span className="font-mono text-lg tabular-nums text-white">{value}<span className="text-[10px] text-white/35">/100</span></span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-ice/55 to-white" style={{ width: `${value}%` }} /></div>{activeMetric === key && <p className="mt-3 border-t border-white/[.08] pt-3 text-[11px] leading-4 text-white/60">{analysis.metricObservations[key]}</p>}</button>)}</div>
    <div className="mt-8"><h2 className="text-lg font-medium tracking-[-.03em]">Kişisel Gelişim Planın</h2><p className="mt-1 text-[12px] text-white/42">Öneriyi incele, günlük alışkanlığı işaretle.</p><div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">{analysis.recommendations.map((item) => <button key={item.category} onClick={() => setActiveCategory(item.category)} className={`shrink-0 rounded-full border px-3.5 py-2 text-[11px] transition ${activeCategory === item.category ? "border-ice/50 bg-ice/10 text-ice" : "border-white/[.1] text-white/45"}`}>{item.category}</button>)}</div><div className="glass mt-3 rounded-[22px] p-5"><p className="text-sm leading-6 text-white/76">{recommendation?.recommendation}</p>{habits.filter((habit) => habit.category === activeCategory).map((habit) => <label key={habit.id} className="mt-5 flex cursor-pointer items-center gap-3 border-t border-white/[.08] pt-4"><input type="checkbox" checked={Boolean(checked[habit.id])} onChange={() => toggleHabit(habit.id)} className="size-4 accent-[#38BDF8]" /><span className={`text-[12px] ${checked[habit.id] ? "text-white/35 line-through" : "text-white/75"}`}>{habit.label}</span></label>)}</div></div>
    <div className="mt-6"><button type="button" onClick={() => void downloadPlan()} disabled={pdfBusy} className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-[#D4B16A]/45 bg-gradient-to-b from-[#D4B16A]/[.16] to-[#D4B16A]/[.05] text-sm font-semibold text-[#E6C98A] transition hover:border-[#D4B16A]/70 disabled:opacity-60 active:scale-[.985]"><svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>{pdfBusy ? "PDF hazırlanıyor..." : "Kişisel Dönüşüm Planını PDF İndir"}</button><p className="mt-2 text-center text-[11px] text-white/35">Tamamen ücretsiz · skorlar, rutinler, saç/sakal ve 30 günlük hedefler</p>{pdfError && <p className="mt-2 text-center text-[12px] text-red-200/90">{pdfError}</p>}</div>
    <AuraChat analysis={analysis} />
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[460px] border-t border-white/[.08] bg-[#09090B]/95 px-5 py-4 backdrop-blur-xl"><div className="flex gap-3"><button onClick={onNewAnalysis} className="h-12 flex-1 rounded-xl border border-white/[.14] text-sm font-medium text-white/80">Yeni Analiz Yap</button><button onClick={() => setShareOpen(true)} className="h-12 flex-1 rounded-xl bg-white text-sm font-semibold text-obsidian">Skor Kartını İndir</button></div></div>{shareOpen && <ShareCardModal analysis={analysis} portrait={portrait} onClose={() => setShareOpen(false)} />}
  </section>;
}
