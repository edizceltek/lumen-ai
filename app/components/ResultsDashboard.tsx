"use client";

import { useEffect, useState } from "react";
import { ShareCardModal } from "./ShareCardModal";
import { AuraChat } from "./AuraChat";
import FaceMeshOverlay from "./FaceMeshOverlay";
import { buildPlan, type CoachingPlan } from "../lib/plan";
import { downloadPlanPdf } from "../lib/pdf";

export type AnalysisMetrics = {
  overall: number;
  potential: number;
  jawline: number;
  cheekbones: number;
  skinQuality: number;
  eyeArea: number;
  symmetry: number;
  faceHarmony: number;
  eyebrows?: number;
  noseRatio?: number;
  lipsMouth?: number;
  hairline?: number;
  facialLeanness?: number;
  neckPosture?: number;
};

export type Recommendation = {
  category:
    | "Cilt Bakımı"
    | "Saç & Sakal Stili"
    | "Yüz & Duruş Egzersizleri"
    | "Yaşam Tarzı & Ödem Kontrolü";
  recommendation: string;
};

export type AnalysisResult = {
  metrics: AnalysisMetrics;
  summary: string;
  strongestFeature: string;
  improvementArea: string;
  highRoi?: { title: string; action: string; gain: string };
  barberPrescription?: { sides: string; top: string; beard: string };
  landmarks?: {
    hairlineY?: number;
    browY?: number;
    noseBaseY?: number;
    chinY?: number;
    leftEyeX?: number;
    rightEyeX?: number;
    eyeY?: number;
    jawLeftX?: number;
    jawRightX?: number;
    jawY?: number;
  };
  metricObservations: Record<string, string>;
  recommendations: Recommendation[];
  plan?: CoachingPlan;
  remainingQuota?: number;
  demo?: boolean;
};

type ScanRecord = {
  id: string;
  date: string;
  overall: number;
  potential: number;
  portrait?: string;
};

type DashboardTab = "overview" | "metrics" | "coach";

const HISTORY_KEY = "lumen-analiz-gecmisi";
const LEGACY_HISTORY_KEY = "aura-analiz-gecmisi";
const HABITS_KEY = "lumen-gunluk-aliskanliklar";
const LEGACY_HABITS_KEY = "aura-gunluk-aliskanliklar";

const habits = [
  { id: "cleanse", label: "Sabah-akşam nazik temizleyici + nemlendirici", category: "Cilt Bakımı" },
  { id: "spf", label: "Sabah SPF 30+ güneş koruyucu uygula", category: "Cilt Bakımı" },
  { id: "style", label: "Yüz şekline uygun saç / sakal çizgisini koru", category: "Saç & Sakal Stili" },
  { id: "posture", label: "10 dk boyun ve chin-tuck duruş egzersizi", category: "Yüz & Duruş Egzersizleri" },
  { id: "water", label: "Günlük 3L su ve akşam düşük sodyum", category: "Yaşam Tarzı & Ödem Kontrolü" },
] as const;

const fallbackObs: Record<string, string> = {
  eyebrows: "Kaş yoğunluğu ve göz mesafesi dengeli; alt çizgi temizliği ifadeyi keskinleştirir.",
  noseRatio: "Burun genişliği orta yüz oranlarıyla uyumlu; profil dengesi doğal görünüyor.",
  lipsMouth: "Dudak simetrisi ve filtrum dengesi yüz alt üçlüsüyle orantılı görünüyor.",
  hairline: "Saç çizgisi alın oranını dengeliyor; yan geçişler yüzü daha keskin çerçeveler.",
  facialLeanness: "Yanak ve çene altı netliği ödem kontrolü ve düzenli su tüketimiyle artırılabilir.",
  neckPosture: "Boyun oranı ve baş duruşu dik tutulduğunda çene hattı belirgin şekilde güçlenir.",
};

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
  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="relative grid size-[118px] sm:size-[132px] place-items-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={emphasis ? "#FAFAFA" : "#38BDF8"}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            className="transition-[stroke-dashoffset] duration-1000 ease-out"
          />
        </svg>
        <div className="text-center">
          <p className="font-mono text-2xl sm:text-3xl font-medium tracking-[-.08em] tabular-nums">
            <AnimatedNumber value={value} />
          </p>
          <p className="mt-0.5 text-[9px] tracking-[.15em] text-white/40">/ 100</p>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] font-medium tracking-wide text-white/62">{label}</p>
    </div>
  );
}

export function ResultsDashboard({
  analysis,
  portrait,
  onNewAnalysis,
}: {
  analysis: AnalysisResult;
  portrait?: string;
  onNewAnalysis: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Recommendation["category"]>("Cilt Bakımı");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string>();
  const [showOverlay, setShowOverlay] = useState(true);
  const [history, setHistory] = useState<ScanRecord[]>([]);

  useEffect(() => {
    const saved =
      window.localStorage.getItem(HABITS_KEY) ??
      window.localStorage.getItem(LEGACY_HABITS_KEY);
    if (saved) {
      try {
        setChecked(JSON.parse(saved) as Record<string, boolean>);
      } catch {}
    }

    try {
      const rawExisting =
        window.localStorage.getItem(HISTORY_KEY) ??
        window.localStorage.getItem(LEGACY_HISTORY_KEY) ??
        "[]";
      const existing = JSON.parse(rawExisting) as ScanRecord[];
      const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
      const entry: ScanRecord = {
        id: `${analysis.metrics.overall}-${analysis.metrics.potential}-${today}`,
        date: today,
        overall: analysis.metrics.overall,
        potential: analysis.metrics.potential,
        portrait: portrait && portrait.length < 300_000 ? portrait : undefined,
      };
      const older = existing
        .filter((item) => item.id !== entry.id)
        .map(({ portrait: _drop, ...rest }) => rest);
      const nextHistory = [entry, ...older].slice(0, 6);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      setHistory(nextHistory);
    } catch {}
  }, [analysis.metrics.overall, analysis.metrics.potential, portrait]);

  const toggleHabit = (id: string) =>
    setChecked((previous) => {
      const next = { ...previous, [id]: !previous[id] };
      try {
        window.localStorage.setItem(HABITS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const downloadPlan = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(undefined);
    try {
      await downloadPlanPdf({ ...analysis, plan: analysis.plan ?? buildPlan(analysis) }, portrait);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "PDF oluşturulamadı. Lütfen tekrar dene.");
    } finally {
      setPdfBusy(false);
    }
  };

  const m = analysis.metrics;
  const metrics = [
    ["jawline", "Çene Hattı", m.jawline],
    ["cheekbones", "Elmacık Kemikleri", m.cheekbones],
    ["skinQuality", "Cilt Kalitesi", m.skinQuality],
    ["eyeArea", "Göz Bölgesi", m.eyeArea],
    ["symmetry", "Yüz Simetrisi", m.symmetry],
    ["faceHarmony", "Yüz Uyumu", m.faceHarmony],
    ["eyebrows", "Kaş Yapısı", m.eyebrows ?? Math.min(96, m.eyeArea - 2)],
    ["noseRatio", "Burun Oranı", m.noseRatio ?? Math.min(95, m.faceHarmony - 1)],
    ["lipsMouth", "Dudak & Ağız", m.lipsMouth ?? Math.min(95, m.symmetry)],
    ["hairline", "Saç Çizgisi", m.hairline ?? Math.min(94, m.faceHarmony - 2)],
    ["facialLeanness", "Yüz Keskinliği", m.facialLeanness ?? Math.min(94, m.jawline - 1)],
    ["neckPosture", "Boyun & Duruş", m.neckPosture ?? Math.min(95, m.jawline)],
  ] as const;

  const highRoi = analysis.highRoi ?? {
    title: analysis.improvementArea || "Cilt Bariyeri & Ödem Kontrolü",
    action: "Sabah SPF + akşam temizlik rutini ve günlük 3L su tüketimiyle ilk 14 günde belirgin netlik kazan.",
    gain: `+${Math.max(4, Math.round((m.potential - m.overall) * 0.55))} Puan`,
  };

  const barber = analysis.barberPrescription ?? {
    sides: "Mid-fade (1.5 mm – 3 mm geçiş), favoriler kulak hizasında keskinleştirilmiş.",
    top: "Üstler 5-7 cm dokulu ve hacimli; yüz oranını dikeyde dengeleyecek şekilde doğal bitiş.",
    beard: "3-4 mm kirli sakal; çene köşesinin 1 parmak üstünden net boyun çizgisi.",
  };

  const previousScan = history.length > 1 ? history[1] : undefined;
  const scoreDelta = previousScan ? m.overall - previousScan.overall : 0;
  const recommendation =
    analysis.recommendations.find((item) => item.category === activeCategory) ??
    analysis.recommendations[0];
  const completedHabitCount = habits.filter((h) => checked[h.id]).length;

  return (
    <section className="fade-up pb-28">
      {/* Üst Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-[.16em] text-ice">LUMEN ANALİZ RAPORU</p>
          <h1 className="mt-0.5 text-[26px] sm:text-[30px] font-medium tracking-[-.05em]">
            Yüz Potansiyelin
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/[.1] bg-white/[.03] px-3 py-1.5">
          <span className="size-2 rounded-full bg-ice shadow-[0_0_10px_2px_rgba(56,189,248,.45)]" />
          <span className="font-mono text-[11px] text-white/75">
            {m.overall} → {m.potential}
          </span>
        </div>
      </div>

      {/* Mobil Uygulama Sekme Çubuğu */}
      <div
        role="tablist"
        aria-label="Analiz bölümleri"
        className="sticky top-2 z-20 mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-white/[.1] bg-[#0B0D13]/90 p-1 backdrop-blur-xl"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          className={`rounded-xl py-2.5 text-[11px] font-medium transition ${
            activeTab === "overview"
              ? "bg-white text-obsidian shadow-sm"
              : "text-white/60 hover:text-white"
          }`}
        >
          Özet & İlk Adım
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "metrics"}
          onClick={() => setActiveTab("metrics")}
          className={`rounded-xl py-2.5 text-[11px] font-medium transition ${
            activeTab === "metrics"
              ? "bg-white text-obsidian shadow-sm"
              : "text-white/60 hover:text-white"
          }`}
        >
          12 Metrik & Oran
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "coach"}
          onClick={() => setActiveTab("coach")}
          className={`rounded-xl py-2.5 text-[11px] font-medium transition ${
            activeTab === "coach"
              ? "bg-white text-obsidian shadow-sm"
              : "text-white/60 hover:text-white"
          }`}
        >
          Plan & Koç
        </button>
      </div>

      {/* SEKME 1: ÖZET & İLK ADIM */}
      {activeTab === "overview" && (
        <div className="mt-4 space-y-4 fade-up">
          <div className="glass rounded-[26px] p-4 sm:p-5">
            <div className="flex divide-x divide-white/[.08]">
              <Gauge label="MEVCUT SKOR" value={analysis.metrics.overall} />
              <Gauge label="POTANSİYEL" value={analysis.metrics.potential} emphasis />
            </div>
            <div className="mt-4 border-t border-white/[.08] pt-3.5">
              <p className="text-[13px] leading-6 text-white/80">
                <span className="font-medium text-white">Güçlü yanın:</span> {analysis.strongestFeature}.{" "}
                <span className="font-medium text-white">Odak alanın:</span> {analysis.improvementArea}.
              </p>
              <p className="mt-1.5 text-[12px] leading-5 text-white/45">{analysis.summary}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-ice/35 bg-gradient-to-br from-ice/[.12] via-white/[.02] to-transparent p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[.16em] text-ice">
                İLK ADIM · EN YÜKSEK KALDIRAÇ (HIGH-ROI)
              </span>
              <span className="rounded-full bg-ice/20 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ice">
                {highRoi.gain}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-white">{highRoi.title}</p>
            <p className="mt-1 text-[12px] leading-5 text-white/65">{highRoi.action}</p>
            <button
              type="button"
              onClick={() => setActiveTab("coach")}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-ice transition hover:opacity-80"
            >
              30 günlük aksiyon planına geç →
            </button>
          </div>

          <div className="glass rounded-[24px] p-4 sm:p-5">
            <p className="text-[10px] font-semibold tracking-[.16em] text-ice">BERBER REÇETESİ</p>
            <h2 className="mt-0.5 text-sm font-medium text-white">Koltukta Gösterilecek Teknik Tarif</h2>
            <div className="mt-3 space-y-2 text-[12px]">
              <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                <span className="font-medium text-white/90">Yanlar & Ense: </span>
                <span className="text-white/60">{barber.sides}</span>
              </div>
              <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                <span className="font-medium text-white/90">Üst Kısım: </span>
                <span className="text-white/60">{barber.top}</span>
              </div>
              <div className="rounded-xl border border-white/[.07] bg-white/[.02] p-3">
                <span className="font-medium text-white/90">Sakal & Favori: </span>
                <span className="text-white/60">{barber.beard}</span>
              </div>
            </div>
          </div>

          <div className="glass rounded-[24px] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold tracking-[.16em] text-ice">İLERLEME TAKİBİ</p>
                <h3 className="mt-0.5 text-sm font-medium text-white">30 Günlük Gelişim Kıyaslama</h3>
              </div>
              {previousScan && (
                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
                    scoreDelta >= 0 ? "bg-ice/15 text-ice" : "bg-white/10 text-white/70"
                  }`}
                >
                  {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} PUAN
                </span>
              )}
            </div>
            {previousScan ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[.08] bg-white/[.02] p-3 text-center">
                  <p className="text-[10px] text-white/45">ÖNCEKİ ({previousScan.date})</p>
                  <p className="mt-1 font-mono text-2xl font-medium text-white/75">{previousScan.overall}</p>
                </div>
                <div className="rounded-2xl border border-ice/30 bg-ice/[.06] p-3 text-center">
                  <p className="text-[10px] text-ice">GÜNCEL ({history[0]?.date})</p>
                  <p className="mt-1 font-mono text-2xl font-medium text-white">{m.overall}</p>
                </div>
              </div>
            ) : (
              <p className="mt-2.5 text-[12px] leading-5 text-white/50">
                İlk taraman cihazına kaydedildi. 15 veya 30 gün sonra aynı ışıkta yeni fotoğraf yüklediğinde puan değişimin burada otomatik kıyaslanacak.
              </p>
            )}
          </div>
        </div>
      )}

      {/* SEKME 2: 12 METRİK & BİYOMETRİK ORAN HARİTASI */}
      {activeTab === "metrics" && (
        <div className="mt-4 space-y-5 fade-up">
          {portrait && (
            <div className="glass overflow-hidden rounded-[24px] p-3.5">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <span className="text-[11px] font-medium tracking-[.12em] text-white/60">
                  YÜZ ORAN HARİTASI
                </span>
                <button
                  type="button"
                  onClick={() => setShowOverlay((v) => !v)}
                  className={`rounded-full border px-3 py-1 text-[10px] font-medium transition ${
                    showOverlay
                      ? "border-ice/45 bg-ice/10 text-ice"
                      : "border-white/15 text-white/50"
                  }`}
                >
                  {showOverlay ? "Çizgiler: Açık" : "Çizgiler: Kapalı"}
                </button>
              </div>
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-black/40">
                <img src={portrait} alt="Yüz oran haritası" className="h-full w-full object-cover" />
                <FaceMeshOverlay imageSrc={portrait} showLines={showOverlay} />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-medium">12 Alanlık Değerlendirme</p>
                <p className="mt-0.5 text-[11px] text-white/40">Gözlemi görmek için bir karta dokun</p>
              </div>
              <span className="text-[11px] font-medium text-ice">12 ALAN</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {metrics.map(([key, title, value]) => (
                <button
                  key={key}
                  onClick={() => setActiveMetric(activeMetric === key ? null : key)}
                  className={`glass rounded-[18px] p-3.5 text-left transition active:scale-[.98] ${
                    activeMetric === key ? "border-ice/45 bg-ice/[.06]" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-1.5">
                    <span className="text-[11px] text-white/65">{title}</span>
                    <span className="font-mono text-base tabular-nums text-white">
                      {value}
                      <span className="text-[10px] text-white/35">/100</span>
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-ice/55 to-white"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                  {activeMetric === key && (
                    <p className="mt-2.5 border-t border-white/[.08] pt-2.5 text-[11px] leading-4 text-white/68">
                      {analysis.metricObservations?.[key] || fallbackObs[key]}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SEKME 3: 30 GÜNLÜK PLAN, PDF & LUMEN AI KOÇ */}
      {activeTab === "coach" && (
        <div className="mt-4 space-y-5 fade-up">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium tracking-[-.02em]">30 Günlük Gelişim Planın</h2>
              <span className="font-mono text-[11px] text-ice">
                {completedHabitCount}/{habits.length} RUTİN
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-white/42">Kategori seç, öneriyi incele ve günlük alışkanlığı işaretle.</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {analysis.recommendations.map((item) => (
                <button
                  key={item.category}
                  onClick={() => setActiveCategory(item.category)}
                  className={`rounded-xl border px-3 py-2 text-left text-[11px] font-medium transition ${
                    activeCategory === item.category
                      ? "border-ice/50 bg-ice/10 text-ice"
                      : "border-white/[.1] bg-white/[.02] text-white/55"
                  }`}
                >
                  {item.category}
                </button>
              ))}
            </div>

            <div className="glass mt-3 rounded-[22px] p-4">
              <p className="text-[13px] leading-6 text-white/80">{recommendation?.recommendation}</p>
              {habits
                .filter((habit) => habit.category === activeCategory)
                .map((habit) => (
                  <label
                    key={habit.id}
                    className="mt-4 flex cursor-pointer items-center gap-3 border-t border-white/[.08] pt-3.5"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checked[habit.id])}
                      onChange={() => toggleHabit(habit.id)}
                      className="size-4 accent-[#38BDF8]"
                    />
                    <span
                      className={`text-[12px] ${
                        checked[habit.id] ? "text-white/35 line-through" : "text-white/78"
                      }`}
                    >
                      {habit.label}
                    </span>
                  </label>
                ))}
            </div>
          </div>

          {/* PDF İndirme */}
          <div>
            <button
              type="button"
              onClick={() => void downloadPlan()}
              disabled={pdfBusy}
              className="flex h-13 w-full items-center justify-center gap-2.5 rounded-2xl border border-[#D4B16A]/45 bg-gradient-to-b from-[#D4B16A]/[.16] to-[#D4B16A]/[.05] text-sm font-semibold text-[#E6C98A] transition hover:border-[#D4B16A]/70 disabled:opacity-60 active:scale-[.985]"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 4v11" />
                <path d="m7 11 5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
              {pdfBusy ? "PDF hazırlanıyor..." : "Kişisel Dönüşüm Planını PDF İndir"}
            </button>
            {pdfError && <p className="mt-2 text-center text-[12px] text-red-200/90">{pdfError}</p>}
          </div>

          <AuraChat analysis={analysis} />
        </div>
      )}

      {/* Sabit Alt Aksiyon Barı */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[460px] border-t border-white/[.08] bg-[#09090B]/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="flex gap-3">
          <button
            onClick={onNewAnalysis}
            className="h-12 flex-1 rounded-xl border border-white/[.14] text-sm font-medium text-white/80 transition hover:border-white/25"
          >
            Yeni Analiz
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="h-12 flex-1 rounded-xl bg-white text-sm font-semibold text-obsidian transition hover:bg-white/95"
          >
            Skor Kartını İndir
          </button>
        </div>
      </div>

      {shareOpen && (
        <ShareCardModal analysis={analysis} portrait={portrait} onClose={() => setShareOpen(false)} />
      )}
    </section>
  );
}