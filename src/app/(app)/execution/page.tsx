"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type AutoStatus = "IDLE" | "RUNNING" | "PAUSED" | "STOPPED";
type TradeMode = "PAPER" | "LIVE";

type AiSignal = {
  market: string;
  price?: number;
  probability?: number;
  signal?: number;
  threshold?: number;
  error?: string;
};

type Position = {
  market: string;
  qty: number;
  avgPrice: number;
  investedKrw: number;
  openedAt: string;
  probability: number;
};

type TradeHistoryItem = {
  id: string;
  type: "BUY" | "SELL";
  market: string;
  qty: number;
  price: number;
  krw: number;
  pnl?: number;
  probability?: number;
  createdAt: string;
};

type PaperAccount = {
  cash: number;
  positions: Position[];
  history: TradeHistoryItem[];
};

const STORAGE_KEY = "ai_quant_paper_account_v1";

const DEFAULT_MARKETS = ["KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-SOL", "KRW-ADA"];

function safeNumber(value: unknown, fallback = 0) {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(n) ? n : fallback;
}

function formatKrw(value: unknown) {
  const n = safeNumber(value, 0);
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}

function formatPct(value: unknown, digits = 2) {
  const n = safeNumber(value, 0);
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function formatProb(value: unknown) {
  return `${(safeNumber(value, 0) * 100).toFixed(2)}%`;
}

function classByNumber(value: unknown) {
  const n = safeNumber(value, 0);
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-rose-300";
  return "text-slate-100";
}

function getDefaultAccount(): PaperAccount {
  return {
    cash: 10_000_000,
    positions: [],
    history: [],
  };
}

function loadAccount(): PaperAccount {
  if (typeof window === "undefined") return getDefaultAccount();

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const init = getDefaultAccount();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
    return init;
  }

  try {
    const parsed = JSON.parse(raw);

    return {
      cash: safeNumber(parsed.cash, 10_000_000),
      positions: Array.isArray(parsed.positions)
        ? parsed.positions.map((p: any) => ({
            market: String(p.market),
            qty: safeNumber(p.qty),
            avgPrice: safeNumber(p.avgPrice),
            investedKrw: safeNumber(p.investedKrw),
            openedAt: p.openedAt ?? new Date().toISOString(),
            probability: safeNumber(p.probability),
          }))
        : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    const init = getDefaultAccount();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
    return init;
  }
}

function saveAccount(account: PaperAccount) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

function Card({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-slate-800 bg-[#0B1220] shadow-[0_20px_60px_rgba(0,0,0,0.35)] ${className}`}
    >
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#111A2E] p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${className}`}>{value}</div>
    </div>
  );
}

export default function ExecutionPage() {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [signals, setSignals] = useState<AiSignal[]>([]);
  const [autoStatus, setAutoStatus] = useState<AutoStatus>("IDLE");
  const [tradeMode, setTradeMode] = useState<TradeMode>("PAPER");

  const [orderKrw, setOrderKrw] = useState("10000000");
  const [maxPositions, setMaxPositions] = useState("3");
  const [cycleSec, setCycleSec] = useState("10");
  const [stopLossPct, setStopLossPct] = useState("3");
  const [takeProfitPct, setTakeProfitPct] = useState("5");

  const [logs, setLogs] = useState<string[]>([]);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<AutoStatus>("IDLE");

  useEffect(() => {
    setAccount(loadAccount());
    refreshSignals();
  }, []);

  useEffect(() => {
    statusRef.current = autoStatus;
  }, [autoStatus]);

  useEffect(() => {
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, []);

  const signalMap = useMemo(() => {
    return signals.reduce(
      (acc, cur) => {
        acc[cur.market] = cur;
        return acc;
      },
      {} as Record<string, AiSignal>,
    );
  }, [signals]);

  const totalPositionValue = useMemo(() => {
    if (!account) return 0;

    return account.positions.reduce((sum, p) => {
      const price = safeNumber(signalMap[p.market]?.price, p.avgPrice);
      return sum + p.qty * price;
    }, 0);
  }, [account, signalMap]);

  const investedKrw = useMemo(() => {
    return account?.positions.reduce((sum, p) => sum + p.investedKrw, 0) ?? 0;
  }, [account]);

  const totalPnl = totalPositionValue - investedKrw;
  const totalEquity = (account?.cash ?? 0) + totalPositionValue;
  const totalPnlPct = investedKrw > 0 ? (totalPnl / investedKrw) * 100 : 0;

  const buySignals = useMemo(() => {
    return signals
      .filter((s) => !s.error && safeNumber(s.signal) === 1)
      .sort((a, b) => safeNumber(b.probability) - safeNumber(a.probability));
  }, [signals]);

  const bestSignal = buySignals[0];

  const addLog = (text: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${text}`;
    setLogs((prev) => [line, ...prev].slice(0, 150));
  };

  const updateAccount = (next: PaperAccount) => {
    saveAccount(next);
    setAccount(next);
  };

  const refreshSignals = async () => {
    try {
      const res = await fetch("/api/ai-signal", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("AI signal API failed");
      }

      const data = await res.json();
      const list = Array.isArray(data) ? data : [];

      setSignals(list);

      const active = list.filter((s) => safeNumber(s.signal) === 1);
      addLog(
        `📡 AI signal updated / ${active.length} buy signal / ${list.length} markets`,
      );

      return list as AiSignal[];
    } catch (error) {
      addLog("❌ AI signal fetch failed. Flask 서버 확인 필요");
      return [];
    }
  };

  const hasPosition = (market: string, source?: PaperAccount) => {
    const live = source ?? loadAccount();
    return live.positions.some((p) => p.market === market);
  };

  const executePaperBuy = (signal: AiSignal, krw: number) => {
    const live = loadAccount();

    if (tradeMode !== "PAPER") {
      addLog("⚠️ Live mode is locked. 현재는 가상매매만 허용");
      return false;
    }

    if (hasPosition(signal.market, live)) {
      addLog(`⚠️ already holding ${signal.market}`);
      return false;
    }

    if (live.positions.length >= safeNumber(maxPositions, 1)) {
      addLog("⚠️ max positions reached");
      return false;
    }

    const price = safeNumber(signal.price);
    if (price <= 0) {
      addLog(`❌ invalid price ${signal.market}`);
      return false;
    }

    const orderAmount = Math.min(krw, live.cash);
    if (orderAmount <= 0) {
      addLog("⚠️ insufficient paper cash");
      return false;
    }

    const qty = orderAmount / price;

    const position: Position = {
      market: signal.market,
      qty,
      avgPrice: price,
      investedKrw: orderAmount,
      openedAt: new Date().toISOString(),
      probability: safeNumber(signal.probability),
    };

    const trade: TradeHistoryItem = {
      id: `${Date.now()}-${signal.market}-BUY`,
      type: "BUY",
      market: signal.market,
      qty,
      price,
      krw: orderAmount,
      probability: safeNumber(signal.probability),
      createdAt: new Date().toISOString(),
    };

    const next: PaperAccount = {
      cash: live.cash - orderAmount,
      positions: [position, ...live.positions],
      history: [trade, ...live.history],
    };

    updateAccount(next);

    addLog(
      `🟢 PAPER BUY ${signal.market} / ${formatKrw(orderAmount)} / prob ${formatProb(signal.probability)}`,
    );

    return true;
  };

  const executePaperSell = (market: string, reason: string) => {
    const live = loadAccount();
    const position = live.positions.find((p) => p.market === market);

    if (!position) return false;

    const signal = signalMap[market];
    const price = safeNumber(signal?.price, position.avgPrice);
    const value = position.qty * price;
    const pnl = value - position.investedKrw;

    const trade: TradeHistoryItem = {
      id: `${Date.now()}-${market}-SELL`,
      type: "SELL",
      market,
      qty: position.qty,
      price,
      krw: value,
      pnl,
      probability: safeNumber(signal?.probability),
      createdAt: new Date().toISOString(),
    };

    const next: PaperAccount = {
      cash: live.cash + value,
      positions: live.positions.filter((p) => p.market !== market),
      history: [trade, ...live.history],
    };

    updateAccount(next);

    addLog(
      `🔴 PAPER SELL ${market} / ${reason} / pnl ${pnl >= 0 ? "+" : ""}${formatKrw(pnl)}`,
    );

    return true;
  };

  const runOnce = async () => {
    const latestSignals = await refreshSignals();

    if (latestSignals.length === 0) return;

    const live = loadAccount();
    const signalByMarket = latestSignals.reduce(
      (acc, cur) => {
        acc[cur.market] = cur;
        return acc;
      },
      {} as Record<string, AiSignal>,
    );

    for (const position of live.positions) {
      const nowSignal = signalByMarket[position.market];
      const nowPrice = safeNumber(nowSignal?.price, position.avgPrice);
      const pnlPct =
        position.avgPrice > 0
          ? ((nowPrice - position.avgPrice) / position.avgPrice) * 100
          : 0;

      if (pnlPct <= -safeNumber(stopLossPct, 3)) {
        executePaperSell(position.market, `stop loss ${formatPct(pnlPct)}`);
        continue;
      }

      if (pnlPct >= safeNumber(takeProfitPct, 5)) {
        executePaperSell(position.market, `take profit ${formatPct(pnlPct)}`);
        continue;
      }

      if (nowSignal && safeNumber(nowSignal.signal) === 0) {
        addLog(
          `👀 HOLD ${position.market} / pnl ${formatPct(pnlPct)} / AI signal off`,
        );
      } else {
        addLog(
          `👀 HOLD ${position.market} / pnl ${formatPct(pnlPct)} / AI signal active`,
        );
      }
    }

    const candidates = latestSignals
      .filter((s) => safeNumber(s.signal) === 1)
      .sort((a, b) => safeNumber(b.probability) - safeNumber(a.probability));

    const current = loadAccount();

    for (const signal of candidates) {
      if (current.positions.length >= safeNumber(maxPositions, 1)) break;
      if (hasPosition(signal.market)) continue;

      executePaperBuy(signal, safeNumber(orderKrw, 0));
      break;
    }

    if (candidates.length === 0) {
      addLog("⏸ no AI buy signal. 신규 진입 없음");
    }
  };

  const startAutoTrading = async () => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }

    if (tradeMode === "LIVE") {
      addLog("⛔ Live trading is locked. 초기 모델은 PAPER 모드만 사용 권장");
      return;
    }

    setAutoStatus("RUNNING");
    statusRef.current = "RUNNING";

    addLog(
      `🤖 PAPER engine started / order ${formatKrw(orderKrw)} / cycle ${cycleSec}s`,
    );

    await runOnce();

    loopRef.current = setInterval(
      async () => {
        if (statusRef.current !== "RUNNING") return;
        await runOnce();
      },
      Math.max(3, safeNumber(cycleSec, 10)) * 1000,
    );
  };

  const pauseAutoTrading = () => {
    setAutoStatus("PAUSED");
    statusRef.current = "PAUSED";
    addLog("⏸ engine paused");
  };

  const stopAutoTrading = () => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }

    setAutoStatus("STOPPED");
    statusRef.current = "STOPPED";
    addLog("⏹ engine stopped");
  };

  const closeAllPositions = () => {
    const live = loadAccount();

    for (const position of live.positions) {
      executePaperSell(position.market, "manual close all");
    }
  };

  const resetAccount = () => {
    if (loopRef.current) clearInterval(loopRef.current);

    const fresh = getDefaultAccount();
    saveAccount(fresh);
    setAccount(fresh);
    setAutoStatus("IDLE");
    statusRef.current = "IDLE";
    setLogs([]);
    addLog("♻️ paper account reset");
  };

  return (
    <div className="min-h-[calc(100dvh-96px)] space-y-5 bg-[#070B12] text-slate-100">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-2">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.28em] text-sky-400">
                AI Quant Execution
              </div>
              <h1 className="mt-2 text-3xl font-bold text-white">
                Upbit AI Paper Trading
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Flask AI 모델의 실시간 신호를 받아 가상매매를 수행합니다. 초기
                모델이므로 실거래 대신 PAPER 모드로 검증합니다.
              </p>
            </div>

            <div className="flex rounded-2xl border border-slate-800 bg-[#111A2E] p-1">
              <button
                onClick={() => setTradeMode("PAPER")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  tradeMode === "PAPER"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-slate-400"
                }`}
              >
                Paper
              </button>
              <button
                onClick={() => {
                  setTradeMode("LIVE");
                  addLog("⚠️ Live mode selected but locked");
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  tradeMode === "LIVE"
                    ? "bg-rose-500/20 text-rose-300"
                    : "text-slate-400"
                }`}
              >
                Live Locked
              </button>
            </div>
          </div>
        </Card>

        <Stat label="Total Equity" value={formatKrw(totalEquity)} />
        <Stat
          label="Total PnL"
          value={`${formatKrw(totalPnl)} / ${formatPct(totalPnlPct)}`}
          className={classByNumber(totalPnl)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card
          title="AI Signal Board"
          className="xl:col-span-8"
          right={
            <button
              onClick={refreshSignals}
              className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20"
            >
              Refresh AI
            </button>
          }
        >
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#111A2E] text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Market</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Probability</th>
                  <th className="px-4 py-3">Threshold</th>
                  <th className="px-4 py-3">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-[#0B1220]">
                {signals.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-slate-500"
                      colSpan={5}
                    >
                      no signal data
                    </td>
                  </tr>
                ) : (
                  signals.map((s) => {
                    const active = safeNumber(s.signal) === 1;

                    return (
                      <tr key={s.market} className="hover:bg-slate-900/70">
                        <td className="px-4 py-4 font-semibold text-slate-100">
                          {s.market}
                        </td>
                        <td className="px-4 py-4 text-slate-300">
                          {s.error ? "-" : formatKrw(s.price)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className={`h-full rounded-full ${
                                  active ? "bg-emerald-400" : "bg-sky-400"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    safeNumber(s.probability) * 100,
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-slate-200">
                              {formatProb(s.probability)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-400">
                          {formatProb(s.threshold)}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                              active
                                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                : "border-slate-700 bg-slate-800/70 text-slate-400"
                            }`}
                          >
                            {active ? "BUY" : "WAIT"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Execution Control"
          className="xl:col-span-4"
          right={
            <span
              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                autoStatus === "RUNNING"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                  : autoStatus === "PAUSED"
                    ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
                    : "border-slate-700 bg-slate-800 text-slate-400"
              }`}
            >
              {autoStatus}
            </span>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Order KRW</label>
                <input
                  value={orderKrw}
                  onChange={(e) => setOrderKrw(e.target.value)}
                  type="number"
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-800 bg-[#111A2E] px-3 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Max Positions</label>
                <input
                  value={maxPositions}
                  onChange={(e) => setMaxPositions(e.target.value)}
                  type="number"
                  min={1}
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-800 bg-[#111A2E] px-3 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Cycle Sec</label>
                <input
                  value={cycleSec}
                  onChange={(e) => setCycleSec(e.target.value)}
                  type="number"
                  min={3}
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-800 bg-[#111A2E] px-3 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Stop Loss %</label>
                <input
                  value={stopLossPct}
                  onChange={(e) => setStopLossPct(e.target.value)}
                  type="number"
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-800 bg-[#111A2E] px-3 text-sm outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400">Take Profit %</label>
                <input
                  value={takeProfitPct}
                  onChange={(e) => setTakeProfitPct(e.target.value)}
                  type="number"
                  className="mt-2 h-11 w-full rounded-2xl border border-slate-800 bg-[#111A2E] px-3 text-sm outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={startAutoTrading}
                className="h-11 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25"
              >
                Start
              </button>
              <button
                onClick={pauseAutoTrading}
                className="h-11 rounded-2xl border border-amber-500/30 bg-amber-500/15 text-sm font-bold text-amber-300 hover:bg-amber-500/25"
              >
                Pause
              </button>
              <button
                onClick={stopAutoTrading}
                className="h-11 rounded-2xl border border-slate-700 bg-slate-800/80 text-sm font-bold text-slate-300 hover:bg-slate-700"
              >
                Stop
              </button>
              <button
                onClick={closeAllPositions}
                className="h-11 rounded-2xl border border-rose-500/30 bg-rose-500/15 text-sm font-bold text-rose-300 hover:bg-rose-500/25"
              >
                Close All
              </button>
            </div>

            <button
              onClick={resetAccount}
              className="h-11 w-full rounded-2xl border border-slate-700 bg-[#111A2E] text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              Reset Paper Account
            </button>

            <div className="rounded-2xl border border-slate-800 bg-[#111A2E] p-4 text-sm text-slate-400">
              Best Signal:{" "}
              <span className="font-semibold text-slate-100">
                {bestSignal
                  ? `${bestSignal.market} / ${formatProb(bestSignal.probability)}`
                  : "No Buy Signal"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card title="Paper Portfolio" className="xl:col-span-8">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Cash" value={formatKrw(account?.cash)} />
            <Stat label="Invested" value={formatKrw(investedKrw)} />
            <Stat
              label="Position Value"
              value={formatKrw(totalPositionValue)}
            />
            <Stat
              label="PnL"
              value={`${formatKrw(totalPnl)} / ${formatPct(totalPnlPct)}`}
              className={classByNumber(totalPnl)}
            />
          </div>

          <div className="space-y-3">
            {(account?.positions ?? []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-500">
                no active paper position
              </div>
            ) : (
              account!.positions.map((p) => {
                const now = safeNumber(signalMap[p.market]?.price, p.avgPrice);
                const value = p.qty * now;
                const pnl = value - p.investedKrw;
                const pnlPct =
                  p.investedKrw > 0 ? (pnl / p.investedKrw) * 100 : 0;

                return (
                  <div
                    key={p.market}
                    className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-800 bg-[#111A2E] p-4 lg:grid-cols-6"
                  >
                    <div>
                      <div className="text-xs text-slate-400">Market</div>
                      <div className="mt-1 font-semibold">{p.market}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Avg</div>
                      <div className="mt-1">{formatKrw(p.avgPrice)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Now</div>
                      <div className="mt-1">{formatKrw(now)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Value</div>
                      <div className="mt-1">{formatKrw(value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">PnL</div>
                      <div
                        className={`mt-1 font-semibold ${classByNumber(pnl)}`}
                      >
                        {formatPct(pnlPct)}
                      </div>
                    </div>
                    <button
                      onClick={() => executePaperSell(p.market, "manual")}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-300"
                    >
                      Sell
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card title="Activity Log" className="xl:col-span-4">
          <div className="max-h-[520px] overflow-auto text-xs text-slate-300">
            {logs.length === 0 ? (
              <div className="text-slate-500">no activity yet</div>
            ) : (
              <ul className="space-y-2">
                {logs.map((log, idx) => (
                  <li key={idx} className="whitespace-pre-wrap">
                    <span className="text-slate-500">• </span>
                    {log}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card title="Recent Trades">
        <div className="overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#111A2E] text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Market</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-[#0B1220]">
              {(account?.history ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    no trade history
                  </td>
                </tr>
              ) : (
                account!.history.slice(0, 20).map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(t.createdAt).toLocaleTimeString()}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        t.type === "BUY" ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {t.type}
                    </td>
                    <td className="px-4 py-3">{t.market}</td>
                    <td className="px-4 py-3">{formatKrw(t.price)}</td>
                    <td className="px-4 py-3">{formatKrw(t.krw)}</td>
                    <td className={`px-4 py-3 ${classByNumber(t.pnl ?? 0)}`}>
                      {typeof t.pnl === "number" ? formatKrw(t.pnl) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
