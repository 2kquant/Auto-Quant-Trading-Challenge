"use client";

import { useEffect, useState } from "react";

type ExchangeType = "upbit" | "binance";
type SettingsTab = "exchange" | "strategy" | "notification";
type LogUpdateIntervalValue = "realtime" | "5sec" | "30sec" | "1min";
type TradingMode = "PAPER" | "LIVE";

type BalanceResponse = {
  exchange: ExchangeType;
  balance?: {
    free?: Record<string, number>;
    used?: Record<string, number>;
    total?: Record<string, number>;
  };
  error?: boolean;
};

type PaperWallet = {
  cash: number | string;
  currency: string;
};

const LOG_UPDATE_INTERVAL_KEY = "ai_quant_log_update_interval_v1";
const TRADE_MODE_KEY = "ai_quant_trade_mode_v1";

const LOG_UPDATE_INTERVAL_OPTIONS: {
  label: string;
  value: LogUpdateIntervalValue;
}[] = [
  { label: "Realtime", value: "realtime" },
  { label: "5 sec", value: "5sec" },
  { label: "30 sec", value: "30sec" },
  { label: "1 min", value: "1min" },
];

function getLogUpdateInterval(value: string | null): LogUpdateIntervalValue {
  return LOG_UPDATE_INTERVAL_OPTIONS.some((option) => option.value === value)
    ? (value as LogUpdateIntervalValue)
    : "realtime";
}

function getTradeMode(value: string | null): TradingMode {
  return value === "LIVE" ? "LIVE" : "PAPER";
}

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("exchange");
  const [userEmail, setUserEmail] = useState("");
  const [exchange, setExchange] = useState<ExchangeType>("upbit");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [balances, setBalances] = useState<BalanceResponse[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [riskLevel, setRiskLevel] = useState("medium");
  const [autoTrading, setAutoTrading] = useState(false);
  const [tradeMode, setTradeMode] = useState<TradingMode>(() => {
    if (typeof window === "undefined") return "PAPER";
    return getTradeMode(localStorage.getItem(TRADE_MODE_KEY));
  });
  const [logUpdateInterval, setLogUpdateInterval] =
    useState<LogUpdateIntervalValue>(() => {
      if (typeof window === "undefined") return "realtime";
      return getLogUpdateInterval(localStorage.getItem(LOG_UPDATE_INTERVAL_KEY));
    });
  const [telegram, setTelegram] = useState("");
  const [isTelegramSaving, setIsTelegramSaving] = useState(false);
  const [telegramLinkStatus, setTelegramLinkStatus] = useState("");
  const [paperWallet, setPaperWallet] = useState<PaperWallet | null>(null);
  const [isWalletLoading, setIsWalletLoading] = useState(false);

  function getAccessToken() {
    return localStorage.getItem("token");
  }

  function loadUser() {
    const user = localStorage.getItem("user");
    if (!user) return;

    try {
      const parsed = JSON.parse(user) as { email?: string };
      setUserEmail(parsed.email || "");
    } catch (err) {
      console.error(err);
    }
  }

  async function loadTradingMode() {
    const token = getAccessToken();
    if (!token) return;

    const res = await fetch("/api/trading-mode", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as { mode?: string };

    if (res.ok) {
      const nextMode = getTradeMode(data.mode || "PAPER");
      setTradeMode(nextMode);
      localStorage.setItem(TRADE_MODE_KEY, nextMode);
    }
  }

  async function saveTradingMode(nextMode: TradingMode) {
    setTradeMode(nextMode);
    localStorage.setItem(TRADE_MODE_KEY, nextMode);
    window.dispatchEvent(new Event("storage"));

    const token = getAccessToken();
    if (!token) return;

    await fetch("/api/trading-mode", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mode: nextMode }),
    });
  }

  async function loadPaperWallet() {
    try {
      const token = getAccessToken();
      if (!token) return;

      const res = await fetch("/api/paper/wallet", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { wallet?: PaperWallet };

      if (res.ok) setPaperWallet(data.wallet || null);
    } catch (err) {
      console.error("LOAD_PAPER_WALLET_ERROR:", err);
    }
  }

  async function handleCreatePaperWallet() {
    try {
      setIsWalletLoading(true);

      const token = getAccessToken();
      if (!token) {
        alert("Login required.");
        return;
      }

      const res = await fetch("/api/paper/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ virtualBalance: 10_000_000 }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Paper account failed");

      await loadPaperWallet();
      alert("Paper account is ready.");
    } catch (err) {
      console.error(err);
      alert("Paper account failed.");
    } finally {
      setIsWalletLoading(false);
    }
  }

  async function loadBalances() {
    try {
      setIsBalanceLoading(true);

      const token = getAccessToken();
      if (!token) {
        setBalances([]);
        return;
      }

      const res = await fetch("/api/exchange/balance", {
        headers: { Authorization: `Bearer ${token}` },
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
    } finally {
      setIsBalanceLoading(false);
    }
  }

  async function handleSaveExchange(e: React.FormEvent) {
    e.preventDefault();

    if (!apiKey || !secretKey) {
      alert("Please enter API Key and Secret Key.");
      return;
    }

    try {
      setIsSaving(true);

      const token = getAccessToken();
      if (!token) {
        alert("Login required.");
        return;
      }

      const res = await fetch("/api/exchange/save-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ exchange, apiKey, secretKey }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Save failed");

      setApiKey("");
      setSecretKey("");
      await loadBalances();
      alert(`${exchange.toUpperCase()} API key saved.`);
    } catch (err) {
      console.error("SAVE_EXCHANGE_ERROR:", err);
      alert("Failed to save exchange API key.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLinkTelegram() {
    try {
      setIsTelegramSaving(true);
      setTelegramLinkStatus("");

      const token = getAccessToken();
      if (!token) {
        alert("Login required.");
        return;
      }

      if (!telegram.trim()) {
        alert("Please enter Telegram Chat ID.");
        return;
      }

      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ telegramChatId: telegram.trim() }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Telegram link failed");

      setTelegramLinkStatus("Telegram account linked.");
    } catch (err) {
      console.error("TELEGRAM_LINK_ERROR:", err);
      setTelegramLinkStatus("Telegram link failed.");
    } finally {
      setIsTelegramSaving(false);
    }
  }

  useEffect(() => {
    loadUser();
    void loadBalances();
    void loadPaperWallet();
    void loadTradingMode();
  }, []);

  useEffect(() => {
    localStorage.setItem(LOG_UPDATE_INTERVAL_KEY, logUpdateInterval);
    window.dispatchEvent(new Event("storage"));
  }, [logUpdateInterval]);

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
          API key is invalid or missing balance permission.
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="mt-3 rounded-xl border border-slate-800 bg-[#0B1420] p-3 text-sm text-slate-500">
          No visible balance.
        </div>
      );
    }

    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-4 bg-[#0B1420] px-3 py-2 text-xs text-slate-500">
          <div>Asset</div>
          <div className="text-right">Free</div>
          <div className="text-right">Used</div>
          <div className="text-right">Total</div>
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
            <div className="text-sm text-slate-400">Account</div>
            <div className="text-lg font-semibold">
              {userEmail || "Not logged in"}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        <div className="flex gap-2">
          {[
            ["exchange", "Exchange"],
            ["strategy", "Strategy"],
            ["notification", "Notification"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as SettingsTab)}
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
              <h2 className="text-lg font-semibold text-slate-100">Exchange API</h2>
              <p className="mt-1 text-sm text-slate-500">
                Save Upbit or Binance keys for balance lookup and LIVE trading.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-400">
                    Exchange
                  </span>
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
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-slate-400">
                    API Key
                  </span>
                  <input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Access / API Key"
                    className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-slate-400">
                    Secret Key
                  </span>
                  <input
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    type="password"
                    placeholder="Secret Key"
                    className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-400/50"
                  />
                </label>

                <button
                  disabled={isSaving}
                  className="h-11 w-full rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save API Key"}
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] lg:col-span-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Exchange Balance
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Loaded through the saved exchange API keys.
                  </p>
                </div>

                <button
                  onClick={loadBalances}
                  disabled={isBalanceLoading}
                  className="h-10 rounded-xl border border-slate-700 bg-[#0B1420] px-4 text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-60"
                >
                  {isBalanceLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {balances.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-[#0B1420] p-4 text-sm text-slate-500">
                    No exchange balance loaded yet.
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
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 space-y-4">
              <h2 className="text-lg font-semibold">Trading Mode</h2>

              <div className="grid grid-cols-2 gap-3">
                {(["PAPER", "LIVE"] as TradingMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => void saveTradingMode(mode)}
                    className={`h-12 rounded-xl border text-sm font-semibold transition ${
                      tradeMode === mode
                        ? mode === "LIVE"
                          ? "border-rose-400 bg-rose-500/20 text-rose-200"
                          : "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                        : "border-slate-800 bg-[#0B1420] text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {mode === "LIVE" ? "LIVE 실전매매" : "PAPER 가상매매"}
                  </button>
                ))}
              </div>

              {tradeMode === "PAPER" ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  PAPER mode uses virtual KRW only. Real Upbit/Binance orders are blocked.
                </div>
              ) : (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">
                  LIVE mode can send real exchange orders after execution confirmation.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 space-y-4">
              <h2 className="text-lg font-semibold">Strategy Settings</h2>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-400">
                  Risk Level
                </span>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none focus:border-emerald-400/50"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-400">
                  Log Update Interval
                </span>
                <select
                  value={logUpdateInterval}
                  onChange={(e) =>
                    setLogUpdateInterval(
                      e.target.value as LogUpdateIntervalValue,
                    )
                  }
                  className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none focus:border-emerald-400/50"
                >
                  {LOG_UPDATE_INTERVAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={autoTrading}
                  onChange={(e) => setAutoTrading(e.target.checked)}
                />
                Auto trading enabled
              </label>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                    Paper Account
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Default virtual balance is 10,000,000 KRW.
                  </p>
                </div>

                <button
                  onClick={handleCreatePaperWallet}
                  disabled={isWalletLoading}
                  className="h-10 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-200 disabled:opacity-60"
                >
                  {isWalletLoading ? "Preparing..." : "Reset Paper Account"}
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-slate-800 bg-[#0B1420] p-4">
                <div className="text-sm text-slate-400">Virtual Balance</div>
                <div className="mt-2 text-3xl font-bold text-emerald-300">
                  {paperWallet
                    ? `${Number(paperWallet.cash).toLocaleString()} ${paperWallet.currency}`
                    : "Not created"}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "notification" && (
          <div className="rounded-2xl border border-slate-800 bg-[#101C2E] p-5 space-y-4">
            <h2 className="text-lg font-semibold">Telegram Link</h2>

            <input
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="Telegram Chat ID"
              className="h-11 w-full rounded-xl border border-slate-800 bg-[#0B1420] px-3 text-sm outline-none focus:border-emerald-400/50"
            />

            <button
              onClick={handleLinkTelegram}
              disabled={isTelegramSaving}
              className="h-11 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-sm font-semibold text-emerald-200 disabled:opacity-60"
            >
              {isTelegramSaving ? "Linking..." : "Link Telegram Account"}
            </button>

            {telegramLinkStatus && (
              <div className="rounded-xl border border-slate-800 bg-[#0B1420] p-3 text-sm text-slate-300">
                {telegramLinkStatus}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
