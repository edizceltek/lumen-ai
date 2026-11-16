// Kişisel Dönüşüm Planı: tipler, doğrulama ve (API planı eksik/hatalı gelirse) yerel üretici.
export type PlanMetrics = {
  overall: number; potential: number; jawline: number; cheekbones: number;
  skinQuality: number; eyeArea: number; symmetry: number; faceHarmony: number;
};
export type PlanWeek = { week: string; title: string; goals: string[] };
export type CoachingPlan = {
  morningRoutine: string[];
  eveningRoutine: string[];
  hairBeard: string[];
  thirtyDayGoals: PlanWeek[];
};

export const DEMO_METRICS: PlanMetrics = {
  overall: 76, potential: 87, jawline: 78, cheekbones: 74, skinQuality: 72, eyeArea: 80, symmetry: 77, faceHarmony: 79,
};

const isStringArray = (value: unknown, min: number, max: number): value is string[] =>
  Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => typeof item === "string" && item.trim().length > 0);

export function isValidPlan(value: unknown): value is CoachingPlan {
  if (typeof value !== "object" || value === null) return false;
  const plan = value as Record<string, unknown>;
  if (!isStringArray(plan.morningRoutine, 3, 7) || !isStringArray(plan.eveningRoutine, 3, 7) || !isStringArray(plan.hairBeard, 2, 6)) return false;
  const weeks = plan.thirtyDayGoals;
  return Array.isArray(weeks) && weeks.length === 4 && weeks.every((week) => {
    const item = week as Record<string, unknown>;
    return typeof item?.week === "string" && typeof item?.title === "string" && isStringArray(item?.goals, 2, 6);
  });
}

type FocusKey = "jawline" | "cheekbones" | "skinQuality" | "eyeArea" | "symmetry" | "faceHarmony";

const focusGoals: Record<FocusKey, { label: string; goal: string }> = {
  jawline: { label: "Çene hattı", goal: "Boyun kası egzersizlerini (çene geri çekme, boyun ekstansiyonu) haftada 4 gün yap; dik duruşu alışkanlık hâline getir. Bölgesel yağ yakımı mümkün değil, genel yağ oranı çene hattını belirleyen ana etkendir." },
  cheekbones: { label: "Elmacık bölgesi", goal: "Düzenli uyku, tuz kontrolü ve dengeli beslenmeyle yüzdeki geçici şişliği azalt; fotoğrafları hep aynı ışık ve açıyla çekerek gerçek değişimi doğru izle." },
  skinQuality: { label: "Cilt kalitesi", goal: "Sabah SPF'yi 30 gün boyunca hiç aksatma; akşam aktif içeriği kademeli başlat. Cilt yenilenmesi birkaç hafta sürer, sabır en önemli bileşendir." },
  eyeArea: { label: "Göz bölgesi", goal: "Uyku saatini sabitle (7-8 saat), akşam geç tuzlu yiyeceği azalt ve ekran süresini yatmadan 30 dakika önce kes; göz altı görünümü en çok bu üç alışkanlıktan etkilenir." },
  symmetry: { label: "Yüz simetrisi", goal: "Hep aynı tarafta çiğneme, aynı yana yatarak uyuma ve telefona eğilerek bakma gibi alışkanlıkları fark et ve dengele. Hafif asimetri normaldir; hedef alışkanlık dengesidir." },
  faceHarmony: { label: "Yüz uyumu", goal: "Saç ve sakal stilini yüz oranlarına göre ayarlamak için berberinle net bir referans fotoğraf üzerinden konuş; stil değişiklikleri uyum algısını en hızlı etkileyen unsurdur." },
};

export function buildPlan(analysis: { metrics: PlanMetrics }): CoachingPlan {
  const m = analysis.metrics;
  const keys: FocusKey[] = ["jawline", "cheekbones", "skinQuality", "eyeArea", "symmetry", "faceHarmony"];
  const weakest = keys.reduce((low, key) => (m[key] < m[low] ? key : low), keys[0]);
  const focus = focusGoals[weakest];
  const skinNeedsWork = m.skinQuality < 75;
  const eyesNeedWork = m.eyeArea < 78;
  const jawNeedsWork = m.jawline < 78;

  const morningRoutine = [
    "Ilık suyla yüzünü yıka; kuru veya hassas hissediyorsan yalnızca su ya da çok nazik, sülfatsız bir temizleyici kullan.",
    skinNeedsWork
      ? "Düşük konsantrasyonlu (%5-10) C vitamini serumu sür; ton eşitsizliği ve donukluk için ilk 2 hafta gün aşırı başla."
      : "Hafif bir hyaluronik asit veya niasinamid serumu ile cildin nem ve denge desteğini koru.",
    "Hafif, yağsız bir nemlendirici ile bariyeri destekle.",
    "SPF 30-50 güneş koruyucuyu yüz, kulak ve boyuna bol miktarda sür; bu, cilt görünümü için en etkili tek adımdır. Dışarıdaysan 2-3 saatte bir yenile.",
    eyesNeedWork
      ? "Göz çevresine 1-2 dakika serin kompres veya kafeinli göz kremi uygula; sabah şişliği hafifletmeye yardımcı olabilir."
      : "Kahvaltıdan önce 1 büyük bardak su iç ve boyun-omuz bölgesini 1 dakika hafifçe aç.",
  ];
  const eveningRoutine = [
    "Gün içinde SPF veya makyaj kullandıysan önce yağ bazlı temizleyici, sonra nazik köpük temizleyici ile çift aşamalı temizlik yap.",
    skinNeedsWork
      ? "Haftada 2 gece düşük doz retinol (%0,1-0,3) ile başla, tolerans geliştikçe 3 geceye çık. Kızarıklık veya soyulma olursa ara ver; hamileysen kullanma."
      : "Haftada 1-2 gece %5-10 laktik veya %0,5-2 salisilik asit ile nazik bir peeling yap; aynı gece retinolle birleştirme.",
    "Seramid içeren bir nemlendirici ile bariyerini onar.",
    "Yatmadan 30 dakika önce ekranı kapat; 7-8 saat uyku hedefle. Başını hafif yüksekte tutmak sabah yüz şişliğini azaltabilir.",
  ];
  const hairBeard = [
    "Yanları kısa, üstü hafif hacimli ve dokulu bir kesim (fade + textured top) çoğu yüz tipine uyar; berberine referans fotoğraf göstererek 4-6 haftada bir yenile.",
    jawNeedsWork
      ? "Sakal bırakıyorsan 3-5 mm kontrollü tut ve boyun çizgisini çene köşesinin yaklaşık 1-1,5 parmak üstünden temizle; bu çene hattını daha net gösterir."
      : "Çene hattın güçlü görünüyor: temiz tıraşlı veya çok kısa (1-3 mm) bakımlı sakal bu hattı doğal biçimde öne çıkarır.",
    "Kaşlara dokunmadan yalnızca aralarındaki ve alt çizgideki fazla tüyleri al; doğal kaş yapısı yüz ifadesini korur.",
    "Kafa derisi bakımı için haftada 2-3 kez nazik şampuan kullan, saç kurutmada ısıyı düşük tut.",
  ];
  const thirtyDayGoals: PlanWeek[] = [
    { week: "Hafta 1", title: "Temel Atma", goals: [
      "Başlangıç referansı olarak gün ışığında, düz karşıdan bir fotoğraf çek (30. günde aynı koşulda tekrarlayacaksın).",
      "Sabah rutini + SPF'yi 7 günün 7'sinde uygula.",
      "Günlük en az 2-2,5 litre su iç ve uyku saatini sabitle.",
    ] },
    { week: "Hafta 2", title: "Alışkanlık Kurma", goals: [
      "Akşam rutinini haftada en az 5 gece tamamla; aktif içeriği (retinol/asit) kademeli ekle.",
      "Her gün 10 dakika boyun-omuz duruş egzersizi yap.",
      "Akşam geç saatte tuzlu yiyecek tüketimini azalt.",
    ] },
    { week: "Hafta 3", title: "Stil ve Güç", goals: [
      "Berberde saç/sakal çizgini güncelle.",
      "Haftada 3 gün kuvvet antrenmanı yap (sırt, omuz, boyun); duruş ve genel oran görünümü iyileşir.",
      focus.goal,
    ] },
    { week: "Hafta 4", title: "Ölçüm ve Ayar", goals: [
      "Hafta 1'deki ile aynı ışık ve açıda yeni fotoğraf çek; yan yana karşılaştır.",
      "Aura'da yeniden analiz yap; değişimi puanlardan çok görünüme ve alışkanlıklarına bakarak değerlendir.",
      `Bir sonraki 30 gün için odak alanını belirle (şu anki öncelik: ${focus.label.toLowerCase()}).`,
    ] },
  ];
  return { morningRoutine, eveningRoutine, hairBeard, thirtyDayGoals };
}
