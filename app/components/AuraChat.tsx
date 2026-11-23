"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "./ResultsDashboard";

type Message = { role: "user" | "assistant"; content: string };

const quickQuestions = [
  "Yüz şeklime en uygun saç kesimi ne?",
  "Çene hattımı nasıl belirginleştiririm?",
  "Cilt rutinimi nasıl kurmalıyım?",
  "30 günde en çok hangi alana odaklanmalıyım?",
];

const greeting: Message = {
  role: "assistant",
  content:
    "Merhaba, ben Lumen AI. Analiz sonuçlarını biliyorum; cilt, saç-sakal, spor, uyku ve genel bakım konusunda sana özel yanıt verebilirim. Aşağıdan bir soru seç ya da kendi sorunu yaz.",
};

export function AuraChat({ analysis }: { analysis: AnalysisResult }) {
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [demo, setDemo] = useState(Boolean(analysis.demo));
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleInputFocus = () => {
    window.setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 250);
  };

  const send = async (raw: string) => {
    const question = raw.trim().slice(0, 500);
    if (!question || loading) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setError(undefined);
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((message) => message !== greeting).slice(-10),
          // Gizlilik gereği fotoğraf gönderilmez; yalnızca metinsel analiz özeti aktarılır
          analysis: {
            metrics: analysis.metrics,
            metricObservations: analysis.metricObservations,
            strongestFeature: analysis.strongestFeature,
            improvementArea: analysis.improvementArea,
            highRoi: analysis.highRoi,
            barberPrescription: analysis.barberPrescription,
            recommendations: analysis.recommendations,
            summary: analysis.summary,
          },
        }),
      });
      const payload = (await response.json()) as {
        reply?: string;
        error?: string;
        demo?: boolean;
      };
      if (!response.ok || !payload.reply)
        throw new Error(
          payload.error || "Lumen AI şu anda yanıt veremiyor. Lütfen tekrar dene."
        );
      if (payload.demo) setDemo(true);
      setMessages([...next, { role: "assistant", content: payload.reply }]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Lumen AI şu anda yanıt veremiyor. Lütfen tekrar dene."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="mt-6 scroll-mb-24">
      <div className="glass overflow-hidden rounded-[26px]">
        <div className="flex items-center gap-3 border-b border-white/[.08] px-4 sm:px-5 py-3.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-full border border-ice/30 bg-ice/10">
            <span className="size-2 rounded-full bg-ice shadow-[0_0_12px_3px_rgba(56,189,248,.45)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              Lumen AI <span className="text-white/35">—</span>{" "}
              <span className="text-white/70">Kişisel Koçun</span>
            </p>
            <p className="truncate text-[11px] text-white/55">
              Skorlarına ve ilk adım planına özel yanıtlar
            </p>
          </div>
          {demo && (
            <span className="shrink-0 rounded-full border border-ice/30 px-2.5 py-1 text-[10px] font-medium tracking-wide text-ice">
              DEMO
            </span>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pt-3.5 pb-1 [scrollbar-width:none]">
          {quickQuestions.map((question) => (
            <button
              key={question}
              type="button"
              disabled={loading}
              onClick={() => void send(question)}
              className="shrink-0 rounded-full border border-white/[.12] bg-white/[.03] px-3.5 py-2 text-[11px] text-white/75 transition hover:border-ice/40 hover:text-ice disabled:opacity-40"
            >
              {question}
            </button>
          ))}
        </div>

        <div
          ref={listRef}
          className="max-h-[320px] min-h-[150px] space-y-3 overflow-y-auto overscroll-contain px-4 py-3.5"
        >
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <p
                className={`max-w-[88%] break-words whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-6 ${
                  message.role === "user"
                    ? "rounded-br-md bg-white text-obsidian"
                    : "rounded-bl-md border border-white/[.08] bg-white/[.04] text-white/85"
                }`}
              >
                {message.content}
              </p>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div
                className="flex gap-1.5 rounded-2xl rounded-bl-md border border-white/[.08] bg-white/[.04] px-4 py-3.5"
                aria-label="Lumen AI yazıyor"
              >
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1.5 animate-pulse rounded-full bg-ice/70"
                    style={{ animationDelay: `${dot * 180}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          {error && (
            <p className="break-words rounded-xl border border-red-400/20 bg-red-400/[.06] px-3 py-2 text-[12px] text-red-200/90">
              {error}
            </p>
          )}
        </div>

        <form
          className="flex items-center gap-2 border-t border-white/[.08] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onFocus={handleInputFocus}
            onChange={(event) => setInput(event.target.value)}
            maxLength={500}
            enterKeyHint="send"
            placeholder="Lumen AI'a bir soru sor..."
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/[.1] bg-white/[.03] px-3.5 text-[16px] sm:text-[13px] text-white outline-none placeholder:text-white/40 focus:border-ice/50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Gönder"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-obsidian transition disabled:bg-white/10 disabled:text-white/30 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h13" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
      <p className="mt-3 px-2 text-center text-[11px] leading-4 text-white/65">
        Lumen AI genel bilgi verir; tıbbi tavsiye değildir. Sağlık veya cilt
        sorunları için bir uzmana danış.
      </p>
    </div>
  );
}
