import { DEMO_METRICS, type PlanMetrics } from "./plan";

export type ChatContext = {
  metrics: PlanMetrics;
  metricObservations?: Partial<Record<"jawline" | "cheekbones" | "skinQuality" | "eyeArea" | "symmetry" | "faceHarmony", string>>;
  strongestFeature?: string;
  improvementArea?: string;
  summary?: string;
};

const labels: Record<string, string> = {
  jawline: "çene hattı", cheekbones: "elmacık bölgesi", skinQuality: "cilt kalitesi",
  eyeArea: "göz bölgesi", symmetry: "yüz simetrisi", faceHarmony: "yüz uyumu",
};

function level(value: number) {
  if (value >= 80) return "güçlü bir alan";
  if (value >= 74) return "iyi durumda ama geliştirilebilir";
  return "öncelikli gelişim alanı";
}

function weakestKey(m: PlanMetrics) {
  const keys = Object.keys(labels) as (keyof typeof labels)[];
  return keys.reduce((low, key) => ((m as Record<string, number>)[key] < (m as Record<string, number>)[low] ? key : low), keys[0]);
}

type Intent = { keys: string[]; reply: (m: PlanMetrics, ctx?: ChatContext) => string };

const intents: Intent[] = [
  {
    keys: ["saç", "kesim", "sakal", "fade", "berber", "yüz şekl", "bıyık", "kaş"],
    reply: (m) => `Yüz şeklini fotoğraf üzerinden kesin söyleyemem; ama analizindeki oranlara bakarak yön gösterebilirim. Çene hattı skorun ${m.jawline}/100 (${level(m.jawline)}), yüz uyumun ${m.faceHarmony}/100.

Genel çerçeve:
• Oval / dengeli yüz: Çoğu kesim yakışır. Yanlar kısa, üstü hafif hacimli (fade + textured top) güvenli ve modern bir seçimdir.
• Kare / belirgin çene: Üstte biraz uzunluk, yanlarda temiz geçiş çeneyi yumuşatmadan dengeler.
• Yuvarlak yüz: Yanları kısa, üstü yukarı doğru hacimli kesim yüzü uzatıp çizgileri belirginleştirir.
• Uzun yüz: Üstte aşırı hacim yerine alında hafif perde ve yanlarda biraz doluluk dengeyi sağlar.

Sakal için: 3-5 mm kontrollü bir uzunluk ve boyun çizgisini çene köşesinin 1-1,5 parmak üstünden temizlemek çene hattını netleştirir. Berberine yüzünün düz karşıdan bir fotoğrafını göster; 4-6 haftada bir yenile.`,
  },
  {
    keys: ["çene", "jawline", "mewing", "boyun", "gıdı"],
    reply: (m) => `Çene hattı skorun ${m.jawline}/100, yani ${level(m.jawline)}. Bilimsel olarak etkisi en yüksek olanlar:

• Vücut yağ oranı: Çene altı ve yanak yağı genel yağ oranıyla birlikte azalır. Bölgesel yağ yakımı mümkün değil; kalori açığı ve kuvvet antrenmanı asıl çözümdür.
• Duruş: Öne uzanan baş duruşu çene altını yumuşak gösterir. Duvara yaslanıp çeneyi geri çekme egzersizini günde 2 x 10 tekrar yap.
• Boyun kasları: Haftada 2-3 gün hafif boyun fleksiyon/ekstansiyon çalışması ve omuz-sırt antrenmanı hattı destekler.
• Sakal/boyun çizgisi: Doğru çizilmiş bir sakal hattı görsel olarak anında fark yaratır.
• Tuz ve uyku: Sabah yüz şişliğini azaltmak çene hattını daha net gösterir.

Mewing (dil duruşu) için yetişkinlerde kemik yapısını değiştirdiğine dair güçlü kanıt yok; zararsız ama beklentiyi düşük tut. "Çene kemiği kırma/bone smashing" gibi yöntemler ise gerçekten risklidir, uzak dur.`,
  },
  {
    keys: ["cilt", "akne", "sivilce", "gözenek", "leke", "rutin", "güneş", "spf", "retinol", "nemlendir", "siyah nokta", "kuru", "yağlı"],
    reply: (m) => `Cilt kalitesi skorun ${m.skinQuality}/100 (${level(m.skinQuality)}). Sade ve sürdürülebilir bir rutin öneririm:

SABAH
1. Ilık suyla yıka (kuruysa yalnızca su).
2. Antioksidan serum: %5-10 C vitamini veya niasinamid.
3. Hafif nemlendirici.
4. SPF 30-50: Güneş koruyucu, cilt görünümü için en kanıtlı adımdır; her gün sür.

AKŞAM
1. Gün içinde SPF/makyaj kullandıysan çift aşamalı temizlik.
2. Haftada 2 gece düşük doz retinol (%0,1-0,3), tolerans arttıkça 3 geceye çık.
3. Seramidli nemlendirici.

Kurallar: Aynı anda tek yeni ürün ekle, 3-4 hafta bekle. Retinol ile asit peelingi aynı gece kullanma. Kızarıklık/soyulma olursa ara ver. Şiddetli akne veya kalıcı sorun için dermatoloğa görün.`,
  },
  {
    keys: ["göz altı", "morluk", "göz çevre", "ödem", "şişlik", "şiş", "su tut", "tuz"],
    reply: (m) => `Göz bölgesi skorun ${m.eyeArea}/100 (${level(m.eyeArea)}). Sabah yüz ve göz çevresi şişliğini azaltmak için kanıta dayalı adımlar:

• Uyku: 7-8 saat ve düzenli saat; göz altı görünümünü en çok etkileyen faktör.
• Tuz: Akşam geç saatlerde işlenmiş ve çok tuzlu yiyecekleri azalt. Tuz suyu tutar ve sabah yüz ödemi yapar.
• Su: Gün boyunca 2-3 litre içmek ödemi dengelemeye yardım eder.
• Alkol: Akşam alkol göz çevresi şişliğini belirgin artırır.
• Baş pozisyonu: Başı hafif yüksekte uyumak sabah birikimi azaltabilir.
• Dışarıdan destek: 1-2 dakika serin kompres veya kafeinli göz kremi geçici fayda verir.

Koyu halkalar kalıtsal veya kemik yapısı kaynaklı da olabilir; bunlar bakımla tamamen değişmez. Şişlik tek taraflı, ağrılı veya kalıcıysa bir hekime danış.`,
  },
  {
    keys: ["uyku", "uyuy", "yorgun"],
    reply: (m) => `Uyku, yüz görünümünde en çok hafife alınan unsur. Göz bölgesi skorun ${m.eyeArea}/100 ve cilt kalitesi ${m.skinQuality}/100; ikisi de uykudan doğrudan etkilenir.

• Her gün aynı saatte yat ve kalk (hafta sonu dahil, fark 1 saati geçmesin).
• Yatmadan 30-60 dakika önce ekranı azalt ve ışığı kıs.
• Kafeini öğleden sonra 14:00 civarında kes.
• Oda serin (yaklaşık 18-20°C) ve karanlık olsun.
• Hedef 7-8 saat. Uzun süre 6 saatin altı cilt yenilenmesini, göz altı görünümünü ve ödemi olumsuz etkiler.`,
  },
  {
    keys: ["spor", "egzersiz", "antrenman", "kas", "ağırlık", "fitness", "kilo", "yağ oran", "diyet", "beslen", "kalori", "protein"],
    reply: (m) => `Yüz görünümü, genel yağ oranı ve duruşla yakından ilişkili. Çene hattın ${m.jawline}/100, elmacık bölgen ${m.cheekbones}/100.

Spor planı önerisi:
• Haftada 3 gün tam vücut kuvvet antrenmanı (squat, itiş, çekiş hareketleri).
• Sırt ve omuz çalışmasına ağırlık ver; duruş düzelince yüz oranları daha dengeli görünür.
• Haftada 2-3 gün 20-30 dk tempolu yürüyüş veya hafif kardiyo.
• Beslenme: Her öğünde protein, bol sebze, işlenmiş gıda ve ekstra tuz az. Yağ kaybı istiyorsan ılımlı bir kalori açığı (günlük yaklaşık %10-20) sürdürülebilir olandır.

Kritik not: Yüzden bölgesel yağ yakılamaz; yüz yağı genel yağla birlikte azalır. Aşırı kısıtlayıcı diyetlerden ve hızlı kilo kaybı vaatlerinden kaçın. Sağlık sorunun varsa başlamadan önce doktoruna danış.`,
  },
  {
    keys: ["elmacık", "simetri", "asimetri", "yanak"],
    reply: (m) => `Elmacık bölgen ${m.cheekbones}/100, yüz simetrin ${m.symmetry}/100. Hafif asimetri tamamen normaldir; hemen herkeste vardır.

Elmacıkların görünürlüğü büyük ölçüde kemik yapısı ve yüz yağ oranıyla belirlenir. Yapabileceklerin:
• Genel yağ oranını sağlıklı aralıkta tut.
• Tuz ve alkolü azaltarak yanak ödemini düşür.
• Fotoğraf çekerken ışığı hafif yandan/üstten al; ışık elmacık gölgesini belirgin gösterir.
• Simetri için: hep aynı yanda çiğneme, hep aynı yana yatma ve telefona eğilme alışkanlıklarını dengele.
• Saç ve sakal çizgisini iki yanda eşit tutarak görsel dengeyi destekle.

Cerrahi veya dolgu yöntemleri kalıcı sonuçlar doğurabilir; düşünüyorsan yalnızca uzman bir hekimle konuş.`,
  },
  {
    keys: ["looksmax", "bone smash", "kemik", "cerrah", "estetik", "botoks", "dolgu", "steroid", "hormon"],
    reply: (m) => `Looksmaxing'e sağlıklı ve kanıta dayalı bakalım. En yüksek getirili, düşük riskli adımlar bunlar:

1. Cilt: Günlük SPF + basit rutin.
2. Saç ve sakal: Yüzüne uygun kesim.
3. Vücut: Kuvvet antrenmanı, ılımlı yağ oranı, düzgün duruş.
4. Uyku ve su: Ödem ve göz çevresi görünümü için.
5. Stil: Doğru beden ölçüsü, temiz ve uyumlu kıyafet.

Uzak durmanı önerdiğim şeyler: "bone smashing", kontrolsüz hormon/steroid kullanımı, kanıtsız "kemik yapısı değiştirme" iddiaları ve aşırı kısıtlayıcı diyetler. Bunlar kalıcı zarar verebilir.

Cerrahi/estetik girişimler kişisel ve tıbbi bir karar; yalnızca uzman hekimle, gerçekçi beklentilerle konuş. Genel skorun ${m.overall}/100 ve potansiyelin ${m.potential}/100; bu fark zaten çoğunlukla bakım ve alışkanlıklarla kapanabilir.`,
  },
  {
    keys: ["skor", "puan", "potansiyel", "30 gün", "plan", "analiz", "öncelik", "odak", "nereden başla", "ne yapmalı"],
    reply: (m, ctx) => {
      const weak = weakestKey(m);
      return `Genel skorun ${m.overall}/100, potansiyelin ${m.potential}/100. Aradaki ${m.potential - m.overall} puanlık fark, bakım ve alışkanlıklarla kapatabileceğin alanı gösteriyor.

Şu an en düşük alanın: ${labels[weak]} (${(m as Record<string, number>)[weak]}/100). Güçlü yanın: ${ctx?.strongestFeature ?? "göz bölgesi ve genel yüz uyumu"}.

30 günlük öncelik sırası:
1. Hafta 1: Sabah SPF'li rutin + uyku düzeni + başlangıç fotoğrafı.
2. Hafta 2: Akşam rutini ve duruş egzersizi.
3. Hafta 3: Saç/sakal çizgisini güncelle, haftada 3 gün kuvvet antrenmanı.
4. Hafta 4: Aynı ışıkta yeni fotoğraf çek, farkı karşılaştır, yeniden analiz yap.

PDF planını indirerek bu adımları detaylı görebilirsin. Hangi alanla başlamak istersin?`;
    },
  },
  {
    keys: ["merhaba", "selam", "teşekkür", "sağ ol", "sağol"],
    reply: () => "Merhaba! Ben Aura AI. Analiz sonuçlarına göre cilt bakımı, saç ve sakal stili, spor, uyku ve genel bakım konularında sorularını yanıtlayabilirim. Yukarıdaki hazır sorulardan birini seçebilir ya da kendi sorunu yazabilirsin.",
  },
];

export function demoCoachReply(question: string, ctx?: ChatContext): string {
  const text = question.toLocaleLowerCase("tr-TR");
  const metrics = ctx?.metrics ?? DEMO_METRICS;
  const match = intents.find((intent) => intent.keys.some((key) => text.includes(key)));
  if (match) return match.reply(metrics, ctx);
  const weak = weakestKey(metrics);
  return `Bu soruyu analiz sonuçlarınla ilişkilendirerek yanıtlıyorum: en çok geliştirilebilir alanın ${labels[weak]} (${(metrics as Record<string, number>)[weak]}/100), genel skorun ${metrics.overall}/100.

Ne zaman hangi konuda yardımcı olabileceğimi şöyle özetleyeyim: saç ve sakal stili, çene hattı, cilt rutini, göz altı ve ödem, uyku, spor ve beslenme ile 30 günlük plan. Sorunu bu konulardan biriyle ilişkilendirip biraz daha ayrıntılı yazarsan sana kişiselleştirilmiş, net bir yanıt verebilirim.

(Demo modundasın: gerçek API anahtarı eklediğinde her soruya serbest, yapay zekâ destekli yanıt alırsın.)`;
}
