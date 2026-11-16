import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getApiKey, isDemoMode } from "../../lib/env";
import { buildPlan, isValidPlan } from "../../lib/plan";

export const runtime = "nodejs";

const FACE_ERROR = "Yüz net algılanamadı. Lütfen aydınlık bir ortamda önden çekilmiş bir fotoğraf yükle.";
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 6;
const DAILY_ANALYSIS_LIMIT = 3;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const dailyUsage = new Map<string, number[]>();

const analysisSchema = {
  name: "facial_aesthetics_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["success", "no_face"] },
      error: { type: ["string", "null"] },
      metrics: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          overall: { type: "integer", minimum: 0, maximum: 100 },
          potential: { type: "integer", minimum: 0, maximum: 100 },
          jawline: { type: "integer", minimum: 0, maximum: 100 },
          cheekbones: { type: "integer", minimum: 0, maximum: 100 },
          skinQuality: { type: "integer", minimum: 0, maximum: 100 },
          eyeArea: { type: "integer", minimum: 0, maximum: 100 },
          symmetry: { type: "integer", minimum: 0, maximum: 100 },
          faceHarmony: { type: "integer", minimum: 0, maximum: 100 },
        },
        required: ["overall", "potential", "jawline", "cheekbones", "skinQuality", "eyeArea", "symmetry", "faceHarmony"],
      },
      summary: { type: ["string", "null"] },
      strongestFeature: { type: ["string", "null"] },
      improvementArea: { type: ["string", "null"] },
      metricObservations: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          jawline: { type: "string" },
          cheekbones: { type: "string" },
          skinQuality: { type: "string" },
          eyeArea: { type: "string" },
          symmetry: { type: "string" },
          faceHarmony: { type: "string" },
        },
        required: ["jawline", "cheekbones", "skinQuality", "eyeArea", "symmetry", "faceHarmony"],
      },
      recommendations: {
        type: [
          "array",
          "null",
        ],
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: {
              type: "string",
              enum: ["Cilt Bakımı", "Saç & Sakal Stili", "Yüz & Duruş Egzersizleri", "Yaşam Tarzı & Ödem Kontrolü"],
            },
            recommendation: { type: "string" },
          },
          required: ["category", "recommendation"],
        },
      },
      plan: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          morningRoutine: { type: "array", items: { type: "string" } },
          eveningRoutine: { type: "array", items: { type: "string" } },
          hairBeard: { type: "array", items: { type: "string" } },
          thirtyDayGoals: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { week: { type: "string" }, title: { type: "string" }, goals: { type: "array", items: { type: "string" } } },
              required: ["week", "title", "goals"],
            },
          },
        },
        required: ["morningRoutine", "eveningRoutine", "hairBeard", "thirtyDayGoals"],
      },
    },
    required: ["status", "error", "metrics", "summary", "strongestFeature", "improvementArea", "metricObservations", "recommendations", "plan"],
  },
} as const;

const systemPrompt = `Sen objektif bir yüz estetiği ve bakım analistisin. Yalnızca yüklenen fotoğrafta açıkça görünen görsel özellikleri değerlendir; yaş, etnik köken, sağlık durumu, kişilik veya çekicilik hakkında çıkarım yapma. Tıbbi teşhis, tedavi ve cerrahi öneri verme.

Önden çekilmiş görselde net bir insan yüzü seçilemiyorsa status="no_face" döndür. Bu durumda error alanını tam olarak "${FACE_ERROR}" yap, diğer tüm alanları null yap.

Net yüz varsa status="success", error=null döndür. Aşağıdaki metrikleri 0-100 arasında tam sayı olarak değerlendir: overall (Genel Skor), potential (Potansiyel), jawline (Çene Hattı), cheekbones (Elmacık Kemikleri), skinQuality (Cilt Kalitesi), eyeArea (Göz Bölgesi), symmetry (Yüz Simetrisi), faceHarmony (Yüz Uyumu). potential her zaman overall değerinden 6 ila 15 puan yüksek olmalı ve 100'ü aşmamalı; bu nedenle overall değeri en fazla 94 olabilir. strongestFeature alanına en güçlü görünen alanı, improvementArea alanına en yüksek kaldıraçlı gelişim alanını yaz. metricObservations içindeki her metrik için fotoğrafta görülebilene dayanan, tek cümlelik, nazik ve kesinlik iddia etmeyen Türkçe gözlem üret. Fotoğrafın açı, ışık ve çözünürlük sınırlamalarını kısa summary içinde belirt.

Tam olarak dört gerçekçi, cerrahi olmayan ve Türkçe öneri ver. Her biri şu kategorilerden birinde ve her kategori yalnızca bir kez kullanılmalı: Cilt Bakımı, Saç & Sakal Stili, Yüz & Duruş Egzersizleri, Yaşam Tarzı & Ödem Kontrolü. Her öneri fotoğrafta görülebilen bir özelliğe nazikçe atıf yapmalı; kesin olmayan gözlemleri kesin gerçek gibi ifade etme.

Ayrıca plan alanını doldur: morningRoutine (4-5 sabah bakım adımı), eveningRoutine (4-5 akşam bakım adımı), hairBeard (3-4 saç ve sakal önerisi) ve thirtyDayGoals (tam 4 hafta; week "Hafta 1" biçiminde, title kısa bir başlık, goals 3-4 ölçülebilir ve uygulanabilir hedef). Plan, skorlara ve gözlemlere göre kişiselleştirilmiş, cerrahi olmayan ve güvenli olmalı; retinol gibi aktif içerikler için kademeli başlamayı ve hassasiyet durumunda ara vermeyi belirt. Tüm metinler Türkçe olsun. no_face durumunda plan da null olmalı.`;


// ---- Demo / test modu: API anahtarı yokken gerçekçi örnek sonuç döndürür ----
const demoAnalysis = {
  status: "success",
  error: null,
  metrics: { overall: 76, potential: 87, jawline: 78, cheekbones: 74, skinQuality: 72, eyeArea: 80, symmetry: 77, faceHarmony: 79 },
  summary: "Demo analizi: Bu sonuç gerçek bir yapay zekâ değerlendirmesi değil, arayüzü test etmek için hazırlanmış örnek veridir. Gerçek analizde açı, ışık ve çözünürlük sınırlamaları burada belirtilir.",
  strongestFeature: "Göz bölgesi ve genel yüz uyumu",
  improvementArea: "Cilt dokusu ve çene hattı belirginliği",
  metricObservations: {
    jawline: "Çene hattı dengeli görünüyor; duruş ve yüz ifadesiyle daha belirgin algılanabilir.",
    cheekbones: "Elmacık bölgesi orantılı; ışığın yönüne göre daha net ya da yumuşak görünebilir.",
    skinQuality: "Cilt tonu genel olarak homojen; düzenli nem ve güneş koruması bu alanı güçlendirebilir.",
    eyeArea: "Göz çevresi canlı ve dengeli görünüyor; uyku düzeni bu bölgeyi doğrudan etkiler.",
    symmetry: "Yüz yarıları arasında doğal ve hafif bir fark var; bu gayet normal bir durum.",
    faceHarmony: "Yüz bölgeleri birbirini iyi tamamlıyor; genel oran uyumu güçlü görünüyor.",
  },
  recommendations: [
    { category: "Cilt Bakımı", recommendation: "Sabah ve akşam nazik bir temizleyiciyle yıkayıp hafif bir nemlendirici kullan; gün içinde en az SPF 30 güneş koruyucu ekle. Cilt dokundaki pürüzsüzlük bu düzenle daha görünür hâle gelebilir." },
    { category: "Saç & Sakal Stili", recommendation: "Yüz hattını destekleyen, yanları temiz ve üstü hafif hacimli bir kesim dene. Sakal bırakıyorsan çene hattını net bir çizgiyle sınırlamak güçlü yanlarını öne çıkarır." },
    { category: "Yüz & Duruş Egzersizleri", recommendation: "Günde 10 dakika boyun ve omuz duruş egzersizi (çene geri çekme, duvara yaslanarak duruş) yap. Dik duruş çene hattının daha belirgin görünmesine yardımcı olur." },
    { category: "Yaşam Tarzı & Ödem Kontrolü", recommendation: "Günde yaklaşık 2,5-3 litre su iç, akşam geç saatlerde tuzlu yiyecekleri azalt ve 7-8 saat uyku hedefle. Bu alışkanlıklar sabah yüz şişliğini ve göz altı görünümünü iyileştirebilir." },
  ],
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(jpeg|jpg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value);
}

function getClientAddress(request: NextRequest): string {
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function exceedsRateLimit(clientAddress: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(clientAddress);
  if (!entry || entry.resetAt <= now) {
    requestCounts.set(clientAddress, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function getDailyUsage(clientAddress: string) {
  const cutoff = Date.now() - DAILY_WINDOW_MS;
  const entries = (dailyUsage.get(clientAddress) ?? []).filter((timestamp) => timestamp > cutoff);
  dailyUsage.set(clientAddress, entries);
  return entries;
}

function getRemainingQuota(clientAddress: string) {
  return Math.max(0, DAILY_ANALYSIS_LIMIT - getDailyUsage(clientAddress).length);
}

function consumeQuota(clientAddress: string) {
  const entries = getDailyUsage(clientAddress);
  entries.push(Date.now());
  dailyUsage.set(clientAddress, entries);
  return Math.max(0, DAILY_ANALYSIS_LIMIT - entries.length);
}

function isValidAnalysis(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const result = value as { metrics?: Record<string, unknown>; recommendations?: unknown; summary?: unknown };
  const metrics = result.metrics;
  const keys = ["overall", "potential", "jawline", "cheekbones", "skinQuality", "eyeArea", "symmetry", "faceHarmony"];
  if (!metrics || !keys.every((key) => Number.isInteger(metrics[key]) && Number(metrics[key]) >= 0 && Number(metrics[key]) <= 100)) return false;
  const delta = Number(metrics.potential) - Number(metrics.overall);
  if (delta < 6 || delta > 15 || typeof result.summary !== "string") return false;
  const observations = (result as { metricObservations?: unknown }).metricObservations;
  if (!observations || typeof observations !== "object" || !["jawline", "cheekbones", "skinQuality", "eyeArea", "symmetry", "faceHarmony"].every((key) => typeof (observations as Record<string, unknown>)[key] === "string")) return false;
  const categories = ["Cilt Bakımı", "Saç & Sakal Stili", "Yüz & Duruş Egzersizleri", "Yaşam Tarzı & Ödem Kontrolü"];
  return Array.isArray(result.recommendations)
    && result.recommendations.length === 4
    && result.recommendations.every((item) => typeof item === "object" && item !== null && "category" in item && "recommendation" in item && categories.includes(String(item.category)) && typeof item.recommendation === "string")
    && new Set(result.recommendations.map((item) => String((item as { category: unknown }).category))).size === 4;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "İstek boyutu çok büyük. Daha küçük fotoğraflar yükle." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const clientAddress = getClientAddress(request);
  const apiKey = getApiKey();
  const demoMode = isDemoMode();
  if (!demoMode && exceedsRateLimit(clientAddress)) {
    return NextResponse.json({ error: "Çok fazla analiz isteği gönderildi. Lütfen bir dakika sonra tekrar dene." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  if (!demoMode && getRemainingQuota(clientAddress) === 0) {
    return NextResponse.json({ error: "Günlük ücretsiz analiz tokenların bitti. Yarın yeni haklarınla tekrar analiz yapabilirsin.", quotaExceeded: true, remainingQuota: 0 }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "86400" } });
  }
  if (!apiKey && !demoMode) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik. Lütfen daha sonra tekrar dene." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body: unknown = await request.json();
    const frontImage = typeof body === "object" && body !== null ? (body as Record<string, unknown>).frontImage : undefined;
    const sideImage = typeof body === "object" && body !== null ? (body as Record<string, unknown>).sideImage : undefined;

    if (!isImageDataUrl(frontImage)) {
      return NextResponse.json({ error: FACE_ERROR }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (sideImage !== undefined && sideImage !== null && !isImageDataUrl(sideImage)) {
      return NextResponse.json({ error: "Yan profil fotoğrafı geçerli bir görsel olmalı." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (frontImage.length > 14_000_000 || (typeof sideImage === "string" && sideImage.length > 14_000_000)) {
      return NextResponse.json({ error: "Fotoğraf dosyası çok büyük. Lütfen 10 MB'tan küçük bir görsel yükle." }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }

    if (demoMode) {
      await sleep(3200); // Tarama animasyonunu görebilmen için kısa bekleme
      return NextResponse.json({ ...demoAnalysis, plan: buildPlan(demoAnalysis), demo: true, remainingQuota: getRemainingQuota(clientAddress) }, { headers: { "Cache-Control": "no-store" } });
    }

    const openai = new OpenAI({ apiKey });
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: "Yüklenen önden görünümü değerlendir. Yan profil varsa onu yalnızca yüz yapısını desteklemek için kullan." },
      { type: "image_url", image_url: { url: frontImage, detail: "high" } },
    ];
    if (typeof sideImage === "string") {
      content.push({ type: "image_url", image_url: { url: sideImage, detail: "high" } });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      response_format: { type: "json_schema", json_schema: analysisSchema },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty model response");
    const analysis = JSON.parse(raw) as { status: string; error: string | null; metrics: unknown; summary: string | null; recommendations: unknown; plan?: unknown };

    if (analysis.status === "no_face") {
      return NextResponse.json({ error: FACE_ERROR }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    if (analysis.status !== "success" || !isValidAnalysis(analysis)) {
      throw new Error("Invalid structured analysis response");
    }
    const remainingQuota = consumeQuota(clientAddress);
    // Plan eksik/hatalı gelirse PDF verisi boş kalmasın diye yerel plan üretilir.
    const plan = isValidPlan(analysis.plan) ? analysis.plan : buildPlan(analysis as unknown as { metrics: Parameters<typeof buildPlan>[0]["metrics"] });
    return NextResponse.json({ ...analysis, plan, remainingQuota }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Analyze route failed", error);
    return NextResponse.json({ error: "Analiz şu anda tamamlanamadı. Lütfen tekrar dene." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Bu işlem yalnızca yerel test ortamında kullanılabilir." }, { status: 404 });
  }
  const clientAddress = getClientAddress(request);
  dailyUsage.delete(clientAddress);
  requestCounts.delete(clientAddress);
  return NextResponse.json({ remainingQuota: DAILY_ANALYSIS_LIMIT }, { headers: { "Cache-Control": "no-store" } });
}
