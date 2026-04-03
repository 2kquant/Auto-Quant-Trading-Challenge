"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/auth/fetch-with-auth";

type ExchangeType = "upbit" | "binance";

type ExchangeAccount = {
  id: string;
  exchange: ExchangeType;
  label: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
};

type BalanceItem = {
  asset: string;
  free: string;
  locked: string;
};

async function parseJsonSafely(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON parse error");
  }
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"exchange" | "strategy" | "notification">(
    "exchange",
  );

  // ===== 상단 고정 유저 =====
  const [userEmail, setUserEmail] = useState("user@email.com");

  // ===== 거래소 =====
  const [exchange, setExchange] = useState<ExchangeType>("upbit");
  const [label, setLabel] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [balances, setBalances] = useState<BalanceItem[]>([]);

  // ===== 퀀트 =====
  const [riskLevel, setRiskLevel] = useState("medium");
  const [autoTrading, setAutoTrading] = useState(false);

  // ===== 알림 =====
  const [telegram, setTelegram] = useState("");

  async function loadAccounts() {
    const res = await fetchWithAuth("/api/exchange-accounts");
    const result = await parseJsonSafely(res);
    setAccounts(result?.accounts ?? []);
  }

  async function loadBalances() {
    const res = await fetchWithAuth("/api/upbit/balances");
    const result = await parseJsonSafely(res);
    setBalances(result?.balances ?? []);
  }

  async function handleSaveExchange(e: any) {
    e.preventDefault();

    await fetchWithAuth("/api/exchange-accounts", {
      method: "POST",
      body: JSON.stringify({
        exchange,
        label,
        accessKey,
        secretKey,
      }),
    });

    setLabel("");
    setAccessKey("");
    setSecretKey("");

    await loadAccounts();
  }

  useEffect(() => {
    loadAccounts();
    loadBalances();
  }, []);

  return (
    <div className="min-h-screen bg-[#0B1420] text-white">
      {/* ================= 상단 고정 (내정보) ================= */}
      <div className="sticky top-0 z-50 bg-[#0B1420] border-b border-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400">로그인 계정</div>
            <div className="text-lg font-semibold">{userEmail}</div>
          </div>

          <button className="h-10 px-4 rounded-xl bg-[#101C2E] border border-slate-700 text-sm">
            비밀번호 변경
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* ================= 탭 버튼 (아래로 이동) ================= */}
        <div className="flex gap-2">
          {[
            ["exchange", "거래소"],
            ["strategy", "퀀트"],
            ["notification", "알림"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`px-4 h-10 rounded-xl text-sm ${
                tab === key
                  ? "bg-emerald-500/20 border border-emerald-400"
                  : "bg-[#101C2E]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ================= 거래소 ================= */}
        {tab === "exchange" && (
          <div className="space-y-6">
            <form
              onSubmit={handleSaveExchange}
              className="bg-[#101C2E] p-5 rounded-xl space-y-4"
            >
              <h2 className="font-semibold">API 연결</h2>

              <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value as any)}
                className="w-full h-10 bg-[#0B1420] px-3 rounded"
              >
                <option value="upbit">Upbit</option>
                <option value="binance">Binance</option>
              </select>

              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="계정 이름"
                className="w-full h-10 bg-[#0B1420] px-3 rounded"
              />

              <input
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="Access Key"
                className="w-full h-10 bg-[#0B1420] px-3 rounded"
              />

              <input
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Secret Key"
                className="w-full h-10 bg-[#0B1420] px-3 rounded"
              />

              <button className="w-full h-10 bg-emerald-500/20 rounded">
                저장
              </button>
            </form>

            <div className="bg-[#101C2E] p-5 rounded-xl">
              {accounts.map((a) => (
                <div key={a.id}>
                  {a.label} ({a.exchange})
                </div>
              ))}
            </div>

            <div className="bg-[#101C2E] p-5 rounded-xl">
              {balances.map((b, i) => (
                <div key={i}>
                  {b.asset} - {b.free}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= 퀀트 ================= */}
        {tab === "strategy" && (
          <div className="bg-[#101C2E] p-5 rounded-xl space-y-4">
            <h2>퀀트 설정</h2>

            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="w-full h-10 bg-[#0B1420]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={autoTrading}
                onChange={(e) => setAutoTrading(e.target.checked)}
              />
              자동매매
            </label>
          </div>
        )}

        {/* ================= 알림 ================= */}
        {tab === "notification" && (
          <div className="bg-[#101C2E] p-5 rounded-xl space-y-4">
            <h2>알림</h2>

            <input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="텔레그램 ID"
              className="w-full h-10 bg-[#0B1420]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
