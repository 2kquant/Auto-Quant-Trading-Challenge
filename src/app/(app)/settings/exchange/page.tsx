"use client";

import React, { useState } from "react";

type Exchange = "upbit" | "binance";

export default function ExchangeSettingsPage() {
  const [exchange, setExchange] = useState<Exchange>("upbit");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!apiKey || !secretKey) {
      alert("API Key와 Secret Key를 입력해 주세요.");
      return;
    }

    try {
      setIsLoading(true);

      const token = localStorage.getItem("token");

      if (!token) {
        alert("로그인이 필요합니다.");
        return;
      }

      const res = await fetch("/api/exchange/save-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exchange,
          apiKey,
          secretKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "키 저장 실패");
      }

      alert(`${exchange.toUpperCase()} API 키가 저장되었습니다.`);
      setApiKey("");
      setSecretKey("");
    } catch (err) {
      console.error(err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#0B1420] text-white px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-100">
            Exchange Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            업비트/바이낸스 API 키를 저장하고 잔고 조회 및 매매에 사용합니다.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-[#0F1A2A]/80 shadow-[0_14px_48px_rgba(0,0,0,0.35)]">
          <div className="border-b border-slate-800/70 px-5 py-4">
            <div className="text-sm font-medium text-slate-200">
              거래소 선택
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {(["upbit", "binance"] as Exchange[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setExchange(item)}
                  className={`h-12 rounded-xl border text-sm font-semibold transition ${
                    exchange === item
                      ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
                      : "border-slate-800/70 bg-[#101C2E] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <label className="mb-2 block text-sm text-slate-400">
                API Key
              </label>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="거래소에서 발급받은 API Key"
                className="h-12 w-full rounded-xl border border-slate-800/70 bg-[#101C2E] px-4 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/50"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-400">
                Secret Key
              </label>
              <input
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                type="password"
                placeholder="거래소에서 발급받은 Secret Key"
                className="h-12 w-full rounded-xl border border-slate-800/70 bg-[#101C2E] px-4 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/50"
              />
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
              업비트/바이낸스 API 권한은 처음에는 조회 권한만 켜는 걸 추천함.
              실제 매매 권한은 주문 API까지 테스트한 뒤 켜는 게 안전함.
            </div>

            <button
              onClick={handleSave}
              disabled={isLoading}
              className="h-12 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60"
            >
              {isLoading ? "저장 중..." : "API 키 저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
