import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getApiKey, isDemoMode } from "../../lib/env";
import { buildPlan, isValidPlan } from "../../lib/plan";

export const runtime = "nodejs";

const FACE_ERROR =
  "Yüz net algılanamadı. Lütfen aydınlık bir ortamda önden çekilmiş bir fotoğraf yükle.";
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const DAILY_ANALYSIS_LIMIT = 5;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const dailyUsage = new Map<string, number[]>();

const REQUIRED_CATEGORIES = [
  "Cilt Bakımı",
  "Saç & Sakal Stili",
  "Yüz & Duruş Egzersizleri",
  "Yaşam Tarzı & Ödem Kontrolü",
] as const;

const systemPrompt = [
  "Sen objektif bir yüz estetiği ve kişisel bakım analistisin.",
  "Yalnızca yüklenen fotoğraftaki görünür özellikleri değerlendir; tıbbi teşhis verme.",
  "SADECE geçerli bir JSON nesnesi döndür, başına/sonuna markdown ekleme.",
  `Önden fotoğrafta net insan yüzü yoksa şu JSON'u döndür:`,
  `{"status":"no_face","error":"${FACE_ERROR}","metrics":null}`,
  "Net yüz varsa şu yapıda JSON döndür:",
  "{",
  '  "status": "success",',
  '  "error": null,',
  '  "metrics": {',
  '    "overall": 0-100, "potential": overall+6..+15 (max 100),',
  '    "jawline": 0-100, "cheekbones": 0-100, "skinQuality": 0-100,',
  '    "eyeArea": 0-100, "symmetry": 0-100, "faceHarmony": 0-100,',
  '    "eyebrows": 0-100, "noseRatio": 0-100, "lipsMouth": 0-100,',
  '    "hairline": 0-100, "facialLeanness": 0-100, "neckPosture": 0-100',
  "  },",
  '  "summary": "Açı, ışık ve genel görünüm hakkında 1-2 cümle Türkçe özet",',
  '  "strongestFeature": "En güçlü görünen özellik",',
  '  "improvementArea": "En yüksek kaldıraçlı gelişim alanı",',
  '  "highRoi": {',
  '    "title": "Tek en etkili hızlı hamle başlığı",',
  '    "action": "Uygulanabilir kısa açıklama",',
  '    "gain": "+5 Puan"',
  "  },",
  '  "barberPrescription": {',
  '    "sides": "Yanlar için teknik kesim tarifi (örn. Mid-fade 1.5-3 mm)",',
  '    "top": "Üst kısım uzunluk ve doku tarifi",',
  '    "beard": "Sakal ve favori çizgisi tarifi"',
  "  },",
  '  "landmarks": {',
  '    "hairlineY": 15-30, "browY": 32-44, "noseBaseY": 52-64, "chinY": 72-88,',
  '    "leftEyeX": 32-44, "rightEyeX": 56-68, "eyeY": 38-48,',
  '    "jawLeftX": 25-36, "jawRightX": 64-75, "jawY": 62-74',
  "  },",
  '  "metricObservations": {',
  '    "jawline": "tek cümle Türkçe gözlem",',
  '    "cheekbones": "tek cümle Türkçe gözlem",',
  '    "skinQuality": "tek cümle Türkçe gözlem",',
  '    "eyeArea": "tek cümle Türkçe gözlem",',
  '    "symmetry": "tek cümle Türkçe gözlem",',
  '    "faceHarmony": "tek cümle Türkçe gözlem",',
  '    "eyebrows": "tek cümle Türkçe gözlem",',
  '    "noseRatio": "tek cümle Türkçe gözlem",',
  '    "lipsMouth": "tek cümle Türkçe gözlem",',
  '    "hairline": "tek cümle Türkçe gözlem",',
  '    "facialLeanness": "tek cümle Türkçe gözlem",',
  '    "neckPosture": "tek cümle Türkçe gözlem"',
  "  },",
  '  "recommendations": [',
  '    {"category": "Cilt Bakımı", "recommendation": "..."},',
  '    {"category": "Saç & Sakal Stili", "recommendation": "..."},',
  '    {"category": "Yüz & Duruş Egzersizleri", "recommendation": "..."},',
  '    {"category": "Yaşam Tarzı & Ödem Kontrolü", "recommendation": "..."}',
  "  ]",
  "}",
].join("\n");

function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^data:image\/(jpeg|jpg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)
  );
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function getClientAddress(request: NextRequest): string {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
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
  const entries = (dailyUsage.get(clientAddress) ?? []).filter((t) => t > cutoff);
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

function cleanGeminiKey() {
  const k = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  return !k || k.startsWith("your_") ? undefined : k;
}

async function getValidModels(key: string): Promise<string[]> {
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || [])
      .filter(
        (m: any) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent")
      )
      .map((m: any) => String(m.name || "").replace(/^models\//, ""))
      .filter((n: string) => n.includes("flash") && !n.includes("image"));
  } catch {
    return [];
  }
}

async function analyzeWithGemini(
  key: string,
  frontImage: string,
  sideImage?: string
) {
  const front = parseDataUrl(frontImage);
  if (!front) throw new Error("Gecersiz on fotograf formati.");

  const parts: any[] = [
    {
      text: "Yüklenen önden yüz fotoğrafını (ve varsa yan profili) 12 metrik üzerinden analiz et, sadece JSON döndür.",
    },
    { inlineData: { mimeType: front.mimeType, data: front.data } },
  ];

  if (typeof sideImage === "string") {
    const side = parseDataUrl(sideImage);
    if (side) {
      parts.push({ inlineData: { mimeType: side.mimeType, data: side.data } });
    }
  }

  const envModel = process.env.GEMINI_MODEL?.trim();
  const discovered = await getValidModels(key);
  const models = Array.from(
    new Set([
      ...(envModel ? [envModel] : []),
      ...discovered,
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ])
  );

  let lastErr = "Model yanit vermedi.";

  for (const model of models) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(model)}:generateContent`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(35000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2200,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "MINIMAL" },
          },
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        try {
          lastErr = JSON.parse(t)?.error?.message || `HTTP ${res.status}`;
        } catch {
          lastErr = `HTTP ${res.status}`;
        }
        continue;
      }

      const data = await res.json();
      const respParts = data.candidates?.[0]?.content?.parts || [];
      const rawText = respParts
        .filter((p: any) => !p.thought && p.text)
        .map((p: any) => p.text)
        .join("")
        .trim();

      if (!rawText) continue;
      const cleaned = rawText.replace(/^```json\s*|\s*```$/g, "").trim();
      return JSON.parse(cleaned);
    } catch (e: any) {
      lastErr = e?.message || "Analiz hatasi";
    }
  }

  throw new Error(lastErr);
}

function normalizeAnalysis(raw: any) {
  if (!raw || raw.status === "no_face") return raw;
  const m = raw.metrics || {};
  const clamp = (v: any, def: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : def;
  };
  const overall = clamp(m.overall, 75);
  const rawPot = clamp(m.potential, overall + 9);
  const potential = Math.min(100, Math.max(overall + 6, Math.min(overall + 15, rawPot)));

  const defaultRecommendations: Record<(typeof REQUIRED_CATEGORIES)[number], string> = {
    "Cilt Bakımı": "Sabah-akşam nazik yüz temizleyici, bariyer onarıcı nemlendirici ve gündüz SPF 30+ güneş koruyucu rutini oluştur.",
    "Saç & Sakal Stili": "Yüz oranlarını dikeyde dengelemek için yanları kademeli kısalt (fade) ve çene çizgisini netleştir.",
    "Yüz & Duruş Egzersizleri": "Günde 10 dakika chin-tuck ve dik baş duruşu pratiği yaparak çene altı hattını belirginleştir.",
    "Yaşam Tarzı & Ödem Kontrolü": "Günlük 2.5–3L su tüketimi, düzenli uyku ve akşam saatlerinde düşük sodyum ile yüz ödemini azalt.",
  };

  const rawRecs = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const recommendations = REQUIRED_CATEGORIES.map((category) => {
    const found = rawRecs.find(
      (item: any) =>
        item &&
        typeof item.category === "string" &&
        item.category.trim() === category &&
        typeof item.recommendation === "string" &&
        item.recommendation.trim().length > 0
    );
    return {
      category,
      recommendation: found ? found.recommendation.trim() : defaultRecommendations[category],
    };
  });

  const strongestFeature =
    typeof raw.strongestFeature === "string" && raw.strongestFeature.trim()
      ? raw.strongestFeature.trim()
      : "Göz bölgesi ve yüz simetrisi";

  const improvementArea =
    typeof raw.improvementArea === "string" && raw.improvementArea.trim()
      ? raw.improvementArea.trim()
      : "Cilt dokusu ve çene hattı netliği";

  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : "Yüz oranların dengeli bir temel sunuyor; düzenli cilt bakımı, doğru saç kesimi ve ödem kontrolüyle görünüm keskinliğin belirgin şekilde artabilir.";

  const highRoi = {
    title:
      typeof raw.highRoi?.title === "string" && raw.highRoi.title.trim()
        ? raw.highRoi.title.trim()
        : improvementArea,
    action:
      typeof raw.highRoi?.action === "string" && raw.highRoi.action.trim()
        ? raw.highRoi.action.trim()
        : "Sabah SPF + akşam temizlik rutini ve günlük 3L su tüketimiyle ilk 14 günde belirgin netlik kazan.",
    gain:
      typeof raw.highRoi?.gain === "string" && raw.highRoi.gain.trim()
        ? raw.highRoi.gain.trim()
        : `+${Math.max(4, Math.round((potential - overall) * 0.55))} Puan`,
  };

  const barberPrescription = {
    sides:
      typeof raw.barberPrescription?.sides === "string" && raw.barberPrescription.sides.trim()
        ? raw.barberPrescription.sides.trim()
        : "Mid-fade (1.5 mm – 3 mm geçiş), favoriler kulak hizasında keskinleştirilmiş.",
    top:
      typeof raw.barberPrescription?.top === "string" && raw.barberPrescription.top.trim()
        ? raw.barberPrescription.top.trim()
        : "Üstler 5–7 cm dokulu ve hacimli; yüz oranını dikeyde dengeleyecek doğal bitiş.",
    beard:
      typeof raw.barberPrescription?.beard === "string" && raw.barberPrescription.beard.trim()
        ? raw.barberPrescription.beard.trim()
        : "3–4 mm kirli sakal; çene köşesinin 1 parmak üstünden net boyun çizgisi.",
  };

  return {
    ...raw,
    status: "success",
    error: null,
    summary,
    strongestFeature,
    improvementArea,
    highRoi,
    barberPrescription,
    metricObservations:
      raw.metricObservations && typeof raw.metricObservations === "object"
        ? raw.metricObservations
        : {},
    recommendations,
    metrics: {
      overall,
      potential,
      jawline: clamp(m.jawline, 74),
      cheekbones: clamp(m.cheekbones, 74),
      skinQuality: clamp(m.skinQuality, 73),
      eyeArea: clamp(m.eyeArea, 76),
      symmetry: clamp(m.symmetry, 75),
      faceHarmony: clamp(m.faceHarmony, 76),
      eyebrows: clamp(m.eyebrows, 75),
      noseRatio: clamp(m.noseRatio, 74),
      lipsMouth: clamp(m.lipsMouth, 75),
      hairline: clamp(m.hairline, 74),
      facialLeanness: clamp(m.facialLeanness, 73),
      neckPosture: clamp(m.neckPosture, 74),
    },
  };
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "İstek boyutu çok büyük. Daha küçük fotoğraflar yükle." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  const clientAddress = getClientAddress(request);
  const geminiKey = cleanGeminiKey();
  const openaiKey = getApiKey();
  const hasRealKey = Boolean(geminiKey || openaiKey);
  const demoMode = !hasRealKey && isDemoMode();

  if (!demoMode && exceedsRateLimit(clientAddress)) {
    return NextResponse.json(
      { error: "Çok fazla analiz isteği gönderildi. Lütfen bir dakika sonra tekrar dene." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }
    );
  }

  if (!demoMode && getRemainingQuota(clientAddress) === 0) {
    return NextResponse.json(
      {
        error: "Günlük ücretsiz analiz hakkın doldu. Yarın tekrar deneyebilirsin.",
        quotaExceeded: true,
        remainingQuota: 0,
      },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "86400" } }
    );
  }

  if (!hasRealKey && !demoMode) {
    return NextResponse.json(
      { error: "API anahtarı bulunamadı. .env.local dosyasına GEMINI_API_KEY ekle." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body: any = await request.json();
    const frontImage = body?.frontImage;
    const sideImage = body?.sideImage;

    if (!isImageDataUrl(frontImage)) {
      return NextResponse.json(
        { error: FACE_ERROR },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    let analysis: any;

    if (geminiKey) {
      analysis = await analyzeWithGemini(
        geminiKey,
        frontImage,
        typeof sideImage === "string" ? sideImage : undefined
      );
    } else if (openaiKey) {
      const openai = new OpenAI({ apiKey: openaiKey });
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: "text", text: "Yüklenen fotoğrafı 12 metrik üzerinden analiz et ve sadece JSON döndür." },
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
      });
      const raw = completion.choices[0]?.message?.content || "";
      analysis = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
    }

    if (analysis?.status === "no_face") {
      return NextResponse.json(
        { error: FACE_ERROR },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    analysis = normalizeAnalysis(analysis);
    const remainingQuota = consumeQuota(clientAddress);
    const plan = isValidPlan(analysis.plan) ? analysis.plan : buildPlan(analysis);

    return NextResponse.json(
      { ...analysis, plan, remainingQuota },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("Analyze route failed", error);
    return NextResponse.json(
      { error: `Analiz hatası: ${error?.message || "Lütfen tekrar dene."}` },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Bu işlem yalnızca yerel test ortamında kullanılabilir." },
      { status: 404 }
    );
  }
  const clientAddress = getClientAddress(request);
  dailyUsage.delete(clientAddress);
  requestCounts.delete(clientAddress);
  return NextResponse.json(
    { remainingQuota: DAILY_ANALYSIS_LIMIT },
    { headers: { "Cache-Control": "no-store" } }
  );
}