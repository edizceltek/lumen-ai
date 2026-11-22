import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getApiKey, isDemoMode } from "../../lib/env";
import { buildPlan, isValidPlan } from "../../lib/plan";

export const runtime = "nodejs";

const FACE_ERROR =
  "Yüz net algılanamadı. Lütfen aydınlık bir ortamda önden çekilmiş bir fotoğraf yükle.";
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const DAILY_ANALYSIS_LIMIT = 5;
const DAILY_INVALID_ATTEMPT_LIMIT = 4;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const requestCounts = new Map<string, { count: number; resetAt: number }>();
const dailyUsage = new Map<string, number[]>();
const dailyInvalidAttempts = new Map<string, number[]>();
let cachedWorkingModel: string | null = null;

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
    value.length <= MAX_REQUEST_BYTES &&
    /^data:image\/(jpeg|jpg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)
  );
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function getClientAddress(request: NextRequest): string {
  const ip =
    request.headers.get("x-nf-client-connection-ip")?.trim() ||
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) return ip;
  const ua = request.headers.get("user-agent") || "anon";
  return `ua:${ua.slice(0, 64)}`;
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

function getDailyEntries(map: Map<string, number[]>, clientAddress: string) {
  const cutoff = Date.now() - DAILY_WINDOW_MS;
  const entries = (map.get(clientAddress) ?? []).filter((t) => t > cutoff);
  map.set(clientAddress, entries);
  return entries;
}

function getRemainingQuota(clientAddress: string) {
  return Math.max(0, DAILY_ANALYSIS_LIMIT - getDailyEntries(dailyUsage, clientAddress).length);
}

function consumeQuota(clientAddress: string) {
  const entries = getDailyEntries(dailyUsage, clientAddress);
  entries.push(Date.now());
  dailyUsage.set(clientAddress, entries);
  return Math.max(0, DAILY_ANALYSIS_LIMIT - entries.length);
}

function exceedsInvalidAttempts(clientAddress: string): boolean {
  return getDailyEntries(dailyInvalidAttempts, clientAddress).length >= DAILY_INVALID_ATTEMPT_LIMIT;
}

function recordInvalidAttempt(clientAddress: string) {
  const entries = getDailyEntries(dailyInvalidAttempts, clientAddress);
  entries.push(Date.now());
  dailyInvalidAttempts.set(clientAddress, entries);
}

function cleanGeminiKey() {
  const k = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  return !k || k.startsWith("your_") ? undefined : k;
}

async function callGeminiModel(key: string, model: string, parts: any[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const genConfig: any = {
    temperature: 0.2,
    maxOutputTokens: 1500,
    responseMimeType: "application/json",
  };

  // Düşünme modunu kapatarak yanıt süresini ~12 sn'den ~3 sn'ye düşürür
  if (model.includes("2.5") || model.includes("3")) {
    genConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(22000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: genConfig,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }

  const data = await res.json();
  const respParts = data.candidates?.[0]?.content?.parts || [];
  const rawText = respParts
    .filter((p: any) => !p.thought && p.text)
    .map((p: any) => p.text)
    .join("")
    .trim();

  if (!rawText) throw new Error("EMPTY_RESPONSE");
  const cleaned = rawText.replace(/^```json\s*|\s*```$/g, "").trim();
  return JSON.parse(cleaned);
}

async function analyzeWithGemini(key: string, frontImage: string, sideImage?: string) {
  const front = parseDataUrl(frontImage);
  if (!front) throw new Error("INVALID_IMAGE");

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
  const candidates = Array.from(
    new Set([
      ...(cachedWorkingModel ? [cachedWorkingModel] : []),
      ...(envModel ? [envModel] : []),
      "gemini-2.5-flash",
      "gemini-flash-latest",
    ])
  );

  let lastErr = "MODEL_UNAVAILABLE";
  for (const model of candidates) {
    try {
      const result = await callGeminiModel(key, model, parts);
      cachedWorkingModel = model;
      return result;
    } catch (e: any) {
      lastErr = e?.message || "GEMINI_ERROR";
      if (!lastErr.includes("404")) break;
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
    "Cilt Bakımı":
      "Sabah-akşam nazik yüz temizleyici, bariyer onarıcı nemlendirici ve gündüz SPF 30+ güneş koruyucu rutini oluştur.",
    "Saç & Sakal Stili":
      "Yüz oranlarını dikeyde dengelemek için yanları kademeli kısalt (fade) ve çene çizgisini netleştir.",
    "Yüz & Duruş Egzersizleri":
      "Günde 10 dakika chin-tuck ve dik baş duruşu pratiği yaparak çene altı hattını belirginleştir.",
    "Yaşam Tarzı & Ödem Kontrolü":
      "Günlük 2.5–3L su tüketimi, düzenli uyku ve akşam saatlerinde düşük sodyum ile yüz ödemini azalt.",
  };

  const rawRecs = Array.isArray(raw
