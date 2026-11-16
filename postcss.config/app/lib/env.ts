// Ortak ortam yardımcıları: gerçek API anahtarı var mı, demo modu aktif mi?
export function getApiKey(): string | undefined {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "your_openai_api_key_here") return undefined;
  return key;
}

// Anahtar yoksa: geliştirme ortamında (veya DEMO_MODE=true ile) demo moduna geç.
export function isDemoMode(): boolean {
  return !getApiKey() && (process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true");
}
