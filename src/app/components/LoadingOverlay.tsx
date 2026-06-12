"use client";

const loadingTexts = [
  "Synchronizing market data",
  "Calibrating AI models",
  "Optimizing execution",
  "Analyzing signals",
];

export default function LoadingOverlay() {
  const text = loadingTexts[Math.floor(Math.random() * loadingTexts.length)];

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="relative">
        <div className="h-16 w-16 animate-spin rounded-full border-[2px] border-white/10 border-t-[#0090FF]" />
      </div>

      <p className="mt-8 text-xs tracking-[0.35em] uppercase text-white/80">
        {text}
      </p>
    </div>
  );
}
