import { NextRequest, NextResponse } from "next/server";
import { isDemoMode } from "../../lib/env";
import { buildPlan, isValidPlan } from "../../lib/plan";

export const runtime = "nodejs";

const FACE_ERROR = "Yüz net algılanamadı. Lütfen aydınlık bir ortamda önden çekilmiş bir fotoğraf yükle.";
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const DAILY_LIMIT = 5;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const rateMap = new Map<string, { count: number; resetAt: number }>();
const dailyUsage = new Map<string, number[]>();
const invalidUsage = new Map<string, number[]>();

const CATEGORIES = [
  "Cilt Bakımı",
  "Saç & Sakal Stili",
  "Yüz & Duruş Egzersizleri",
  "Yaşam Tarzı & Ödem Kontrolü",
] as const;

const systemPrompt = [
  "Sen objektif bir yüz estetiği ve kişisel bakım analistisin. Yalnızca görünür özellikleri değerlendir, tıbbi teşhis verme.",
  `Önden net insan yüzü yoksa SADECE şunu döndür: {"status":"no_face","error":"${FACE_ERROR}","metrics":null}`,
  "Net yüz varsa SADECE geçerli JSON döndür (markdown veya açıklama ekleme):",
  '{"status":"success","error":null,"metrics":{"overall":76,"potential":86,"jawline":75,"cheekbones":76,"skinQuality":74,"eyeArea":78,"symmetry":77,"faceHarmony":77,"eyebrows":76,"noseRatio":75,"lipsMouth":76,"hairline":75,"facialLeanness":74,"neckPosture":75},"summary":"1-2 cümle Türkçe özet","strongestFeature":"En güçlü özellik","improvementArea":"Öncelikli gelişim alanı","highRoi":{"title":"En etkili hızlı hamle","action":"Kısa açıklama","gain":"+5 Puan"},"barberPrescription":{"sides":"Yanlar kesim tarifi","top":"Üst kısım tarifi","beard":"Sakal çizgisi tarifi"},"metricObservations":{"jawline":"tek cümle","cheekbones":"tek cümle","skinQuality":"tek cümle","eyeArea":"tek cümle","symmetry":"tek cümle","faceHarmony":"tek cümle","eyebrows":"tek cümle","noseRatio":"tek cümle","lipsMouth":"tek cümle","hairline":"tek cümle","facialLeanness":"tek cümle","neckPosture":"tek cümle"},"recommendations":[{"category":"Cilt Bakımı","recommendation":"..."},{"category":"Saç & Sakal Stili","recommendation":"..."},{"category":"Yüz & Duruş Egzersizleri","recommendation":"..."},{"category":"Yaşam Tarzı & Ödem Kontrolü","recommendation":"..."}]}',
].join("\n");

function isImageUrl(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_REQUEST_BYTES && /^data:image\/(jpeg|jpg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(v);
}

function parseDataUrl(url: string) {
  const m = url.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-nf-client-connection-ip")?.trim() ||
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    `ua:${(req.headers.get("user-agent") || "anon").slice(0, 48)}`
  );
}

function checkRate(ip: string): boolean {
  const now = Date.now();
  const e = rateMap.get(ip);
  if (!e || e.resetAt <= now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  e.count += 1;
  return e.count > 8;
}

function getEntries(map: Map<string, number[]>, ip: string) {
  const cutoff = Date.now() - DAILY_WINDOW_MS;
  const list = (map.get(ip) ?? []).filter((t) => t > cutoff);
  map.set(ip, list);
  return list;
}

function cleanKey(raw: string | undefined) {
  const k = raw?.trim().replace(/^["']|["']$/g, "");
  return !k || k.startsWith("your_") ? undefined : k;
}

function extractJson(raw: string) {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON_PARSE_ERR");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyzeGemini(key: string, frontImg: string, sideImg?: string) {
  const front = parseDataUrl(frontImg);
  if (!front) throw new Error("INVALID_IMG");
  const parts: any[] = [
    { text: "Yüz fotoğrafını 12 metrik üzerinden analiz et, sadece JSON döndür." },
    { inlineData: { mimeType: front.mimeType, data: front.data } },
  ];
  if (sideImg) {
    const side = parseDataUrl(sideImg);
    if (side) parts.push({ inlineData: { mimeType: side.mimeType, data: side.data } });
  }

  const models = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ];

  let lastErr = "GEMINI_ERR";
  for (const model of models) {
    try {
      const genConfig: any = { temperature: 0.2, maxOutputTokens: 1400, responseMimeType: "application/json" };
      if (model === "gemini-2.5-flash") genConfig.thinkingConfig = { thinkingBudget: 0 };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts }],
            generationConfig: genConfig,
          }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const msg = errBody?.error?.message || `HTTP_${res.status}`;
        lastErr = `${model}: ${msg.slice(0, 45)}`;
        continue;
      }

      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter((p: any) => !p.thought && p.text)
        .map((p: any) => p.text)
        .join("")
        .trim();
      if (text) return extractJson(text);
    } catch (e: any) {
      lastErr = `${model}: ${e?.message || "ERR"}`;
    }
  }
  throw new Error(lastErr);
}

function normalize(raw: any) {
  if (!raw || raw.status === "no_face") return raw;
  const m = raw.metrics || {};
  const clamp = (v: any, d: number) => (Number.isFinite(Math.round(Number(v))) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : d);
  const overall = clamp(m.overall, 75);
  const potential = Math.min(100, Math.max(overall + 6, Math.min(overall + 15, clamp(m.potential, overall + 9))));

  const defaults: Record<(typeof CATEGORIES)[number], string> = {
    "Cilt Bakımı": "Sabah-akşam nazik temizleyici, nemlendirici ve gündüz SPF 30+ güneş koruyucu rutini oluştur.",
    "Saç & Sakal Stili": "Yanları kademeli kısalt (fade) ve çene çizgisini netleştir.",
    "Yüz & Duruş Egzersizleri": "Günde 10 dakika chin-tuck ve dik baş duruşu pratiği yap.",
    "Yaşam Tarzı & Ödem Kontrolü": "Günlük 2.5–3L su tüketimi, düzenli uyku ve akşam düşük sodyum ile ödemi azalt.",
  };
  const recs = Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const recommendations = CATEGORIES.map((category) => {
    const f = recs.find((i: any) => i?.category?.trim() === category && i?.recommendation?.trim());
    return { category, recommendation: f ? f.recommendation.trim() : defaults[category] };
  });

  const improvementArea = raw.improvementArea?.trim() || "Cilt dokusu ve çene hattı netliği";
  return {
    ...raw,
    status: "success",
    error: null,
    summary: raw.summary?.trim() || "Yüz oranların dengeli; düzenli bakım, doğru kesim ve ödem kontrolüyle görünüm keskinliğin artabilir.",
    strongestFeature: raw.strongestFeature?.trim() || "Göz bölgesi ve yüz simetrisi",
    improvementArea,
    highRoi: {
      title: raw.highRoi?.title?.trim() || improvementArea,
      action: raw.highRoi?.action?.trim() || "Sabah SPF + akşam temizlik rutini ve günlük 3L su tüketimiyle 14 günde netlik kazan.",
      gain: raw.highRoi?.gain?.trim() || `+${Math.max(4, Math.round((potential - overall) * 0.55))} Puan`,
    },
    barberPrescription: {
      sides: raw.barberPrescription?.sides?.trim() || "Mid-fade (1.5–3 mm geçiş), favoriler kulak hizasında keskinleştirilmiş.",
      top: raw.barberPrescription?.top?.trim() || "Üstler 5–7 cm dokulu ve hacimli; yüz oranını dikeyde dengeleyecek doğal bitiş.",
      beard: raw.barberPrescription?.beard?.trim() || "3–4 mm kirli sakal; çene köşesinin 1 parmak üstünden net boyun çizgisi.",
    },
    metricObservations: raw.metricObservations && typeof raw.metricObservations === "object" ? raw.metricObservations : {},
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

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "İstek boyutu çok büyük." }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  const ip = getClientIp(req);
  const geminiKey = cleanKey(process.env.GEMINI_API_KEY);
  const demo = !geminiKey && isDemoMode();

  if (!demo && checkRate(ip)) {
    return NextResponse.json({ error: "Çok fazla istek. Bir dakika sonra dene." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  if (!demo && (getEntries(dailyUsage, ip).length >= DAILY_LIMIT || getEntries(invalidUsage, ip).length >= 4)) {
    return NextResponse.json({ error: "Günlük ücretsiz analiz hakkın doldu.", quotaExceeded: true, remainingQuota: 0 }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  if (!geminiKey && !demo) {
    return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body: any = await req.json();
    if (!isImageUrl(body?.frontImage)) {
      return NextResponse.json({ error: FACE_ERROR }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const side = isImageUrl(body?.sideImage) ? body.sideImage : undefined;
    let analysis: any = await analyzeGemini(geminiKey!, body.frontImage, side);

    if (analysis?.status === "no_face") {
      getEntries(invalidUsage, ip).push(Date.now());
      return NextResponse.json({ error: FACE_ERROR }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }

    analysis = normalize(analysis);
    const used = getEntries(dailyUsage, ip);
    used.push(Date.now());
    const remainingQuota = Math.max(0, DAILY_LIMIT - used.length);
    const plan = isValidPlan(analysis.plan) ? analysis.plan : buildPlan(analysis);
    return NextResponse.json({ ...analysis, plan, remainingQuota }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    const code = typeof err?.message === "string" ? err.message.slice(0, 70) : "ERR";
    return NextResponse.json({ error: `Analiz hatası (${code}). Lütfen tekrar dene.` }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ip = getClientIp(req);
  dailyUsage.delete(ip);
  invalidUsage.delete(ip);
  rateMap.delete(ip);
  return NextResponse.json({ remainingQuota: DAILY_LIMIT }, { headers: { "Cache-Control": "no-store" } });
}
