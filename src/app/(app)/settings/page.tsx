"use client";

import { useEffect, useState } from "react";

type ExchangeType = "upbit" | "binance";

type BalanceResponse = {
  exchange: ExchangeType;
  balance?: {
    free?: Record<string, number>;
    used?: Record<string, number>;
    total?: Record<string, number>;
  };
  error?: boolean;
};

export default function SettingsPage() {
  const [tab, setTab] = useState<"exchange" | "strategy" | "notification">(
    "exchange",
  );

  const [userEmail, setUserEmail] = useState("");

  const [exchange, setExchange] = useState<ExchangeType>("upbit");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const [balances, setBalances] = useState<BalanceResponse[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);

  const [riskLevel, setRiskLevel] = useState("medium");
  const [autoTrading, setAutoTrading] = useState(false);
  const [telegram, setTelegram] = useState("");

  const [paperWallet, setPaperWallet] = useState<any>(null);
  const [isWalletLoading, setIsWalletLoading] = useState(false);

  async function loadPaperWallet() {
    try {
      const token = getAccessToken();

      if (!token) return;

      const res = await fetch("/api/paper/wallet", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        return;
      }

      setPaperWallet(data.wallet || null);
    } catch (err) {
      console.error("LOAD_PAPER_WALLET_ERROR:", err);
    }
  }

  async function handleCreatePaperWallet() {
    try {
      setIsWalletLoading(true);

      const token = getAccessToken();

      if (!token) {
        alert("로그인 필요");
        return;
      }

      const res = await fetch("/api/paper/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cash: 10000,
          currency: "USDT",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "가상머니 발급 실패");
      }

      alert("가상머니 발급 완료");

      await loadPaperWallet();
    } catch (err) {
      console.error(err);
      alert("가상머니 발급 실패");
    } finally {
      setIsWalletLoading(false);
    }
  }

  function getAccessToken() {
    return localStorage.getItem("token");
  }

  function loadUser() {
    const user = localStorage.getItem("user");

    if (!user) return;

    try {
      const parsed = JSON.parse(user);
      setUserEmail(parsed?.email || "");
    } catch (err) {
      console.error(err);
    }
  }

  async function loadBalances() {
    try {
      const token = getAccessToken();

      if (!token) {
        setBalances([]);
        return;
      }

      const res = await fetch("/api/exchange/balance", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        setBalances([]);
        return;
      }

      const data = await res.json();

      setBalances(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("BALANCE_FETCH_ERROR:", err);
      setBalances([]);
    }
  }
  async function handleSaveExchange(e: React.FormEvent) {
    e.preventDefault();

    if (!apiKey || !secretKey) {
      alert("API Key와 Secret Key를 입력해 주세요.");
      return;
    }

    try {
      setIsSaving(true);

      const token = getAccessToken();

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

      alert(`${exchange.toUpperCase()} API 키 저장 완료`);

      setApiKey("");
      setSecretKey("");

      await loadBalances();
    } catch (err) {
      console.error("SAVE_EXCHANGE_ERROR:", err);
      alert("거래소 키 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    loadUser();
    loadBalances();
    loadPaperWallet();
  }, []);

  const renderBalanceRows = (item: BalanceResponse) => {
    const total = item.balance?.total || {};
    const free = item.balance?.free || {};
    const used = item.balance?.used || {};

    const rows = Object.keys(total)
      .filter((asset) => Number(total[asset]) > 0)
      .slice(0, 20);

    if (item.error) {
      return (
        <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">
          API 키가 잘못됐거나 거래소 권한이 부족합니다.
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="mt-3 rounded-xl border border-slate-800 bg-[#0B1420] p-3 text-sm text-slate-500">
          표시할 잔고가 없습니다.
        </div>
      );
    }

    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-4 bg-[#0B1420] px-3 py-2 text-xs text-slate-500">
          <div>자산</div>
          <div className="text-right">사용가능</div>
          <div className="text-right">주문중</div>
          <div className="text-right">총수량</div>
        </div>

        {rows.map((asset) => (
          <div
            key={asset}
            className="grid grid-cols-4 border-t border-slate-800 px-3 py-2 text-sm"
          >
            <div className="font-semibold text-slate-100">{asset}</div>

            <div className="text-right text-slate-300">
              {Number(free[asset] || 0).toLocaleString()}
            </div>

            <div className="text-right text-slate-400">
              {Number(used[asset] || 0).toLocaleString()}
            </div>

            <div className="text-right text-emerald-300">
              {Number(total[asset] || 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B1420] text-white">
      <div className="sticky top-0 z-50 border-b border-slate-800 bg-[#0B1420]/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="text-sm text-slate-400">로그인 계정</div>

            <div className="text-lg font-semibold">
              {userEmail || "로그인 정보 없음"}
            </div>
          </div>

          <button className="h-10 rounded-xl border border-slate-700 bg-[#101C2E] px-4 text-sm">
            비밀번호 변경
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        <div className="flex gap-2">
          {[
            ["exchange", "거래소"],
            ["strategy", "퀀트"],
            ["notification", "알림"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`h-10 rounded-xl px-4 text-sm transition ${
                tab === key
                  ? "border border-emerald-400 bg-emerald-500/20 text-emerald-200"
                  : "border border-slate-800 bg-[#101C2E] text-slate-400 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "exchange" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <form
              onSubmit={handleSaveExchange}
              className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] lg:col-span-2"
            >
              <h2 className="text-lg font-semibold text-slate-100">API 연결</h2>

              <p className="mt-1 text-sm text-slate-500">
                저장 후 자동으로 잔고를 조회합니다.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    거래소
                  </label>

                  <select
                    value={exchange}
                    onChange={(e) =>
                      setExchange(e.target.value as ExchangeType)
                    }
                    className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none"
                  >
                    <option value="upbit">Upbit</option>
                    <option value="binance">Binance</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-400">
                    API Key
                  </label>

                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Access / API Key"
                    className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
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
                    placeholder="Secret Key"
                    className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
                  />
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
                  처음에는 거래소 API 권한을 조회 전용으로 테스트하고, 매매
                  권한은 주문 API 검증 후 켜는 걸 추천합니다.
                </div>

                <button
                  disabled={isSaving}
                  className="h-11 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60"
                >
                  {isSaving ? "저장 중..." : "API 키 저장"}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] lg:col-span-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    거래소 잔고
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    저장된 API 키 기준으로 CCXT에서 불러온 잔고입니다.
                  </p>
                </div>

                <button
                  onClick={loadBalances}
                  disabled={isBalanceLoading}
                  className="h-10 rounded-xl border border-slate-700 bg-[#0B1420] px-4 text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-60"
                >
                  {isBalanceLoading ? "조회 중..." : "새로고침"}
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {balances.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-[#0B1420] p-4 text-sm text-slate-500">
                    아직 저장된 거래소 키가 없거나 잔고를 불러오지 못했습니다.
                  </div>
                )}

                {balances.map((item, index) => (
                  <div
                    key={`${item.exchange}-${index}`}
                    className="rounded-2xl border border-slate-800 bg-[#0B1420]/70 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-base font-semibold text-slate-100">
                        {item.exchange.toUpperCase()}
                      </div>

                      <span
                        className={`rounded-lg border px-2 py-1 text-xs ${
                          item.error
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        }`}
                      >
                        {item.error ? "Error" : "Connected"}
                      </span>
                    </div>

                    {renderBalanceRows(item)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "strategy" && (
          <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 space-y-4">
            <h2 className="text-lg font-semibold">퀀트 설정</h2>

            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="h-11 w-full rounded-xl bg-[#0B1420] px-3"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            <label className="flex gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={autoTrading}
                onChange={(e) => setAutoTrading(e.target.checked)}
              />
              자동매매
            </label>
          </div>
        )}

        {tab === "notification" && (
          <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 space-y-4">
            <h2 className="text-lg font-semibold">알림</h2>

            <input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="텔레그램 ID"
              className="h-11 w-full rounded-xl bg-[#0B1420] px-3"
            />
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              가상 투자 계좌
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              자동매매 및 테스트용 Paper Trading 계좌
            </p>
          </div>

          <button
            onClick={handleCreatePaperWallet}
            disabled={isWalletLoading}
            className="h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-200"
          >
            {isWalletLoading ? "발급 중..." : "가상머니 발급"}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-[#0B1420] p-4">
          <div className="text-sm text-slate-400">보유 가상머니</div>

          <div className="mt-2 text-3xl font-bold text-emerald-300">
            {paperWallet
              ? `${Number(paperWallet.cash).toLocaleString()} ${paperWallet.currency}`
              : "미발급"}
          </div>
        </div>
      </div>
    </div>
  );
}
