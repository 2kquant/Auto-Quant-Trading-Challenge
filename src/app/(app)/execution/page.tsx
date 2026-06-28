"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type AutoStatus = "IDLE" | "RUNNING" | "PAUSED" | "STOPPED";
type TradeMode = "PAPER" | "LIVE";
type ExchangeName = "upbit" | "binance";
type LogType = "BUY" | "SELL" | "INFO" | "ERROR";
type LogUpdateIntervalValue = "realtime" | "5sec" | "30sec" | "1min";

type AiSignal = {
  market: string;
  price?: number;
  probability?: number;
  signal?: number;
  threshold?: number;
  rsi?: number;
  volume?: number;
  trendProbability?: number;
  trend_probability?: number;
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

type ActivityLog = {
  id: string;
  type: LogType;
  time: string;
  message: string;
};

type LiveOrderResponse = {
  success?: boolean;
  exchange?: ExchangeName;
  inputMarket?: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  filled?: number;
  average?: number;
  cost?: number;
  status?: string;
  error?: string;
};

type PaperAccount = {
  cash: number;
  positions: Position[];
  history: TradeHistoryItem[];
};

const STORAGE_KEY = "ai_quant_paper_account_v1";
const LOG_UPDATE_INTERVAL_KEY = "ai_quant_log_update_interval_v1";
const AI_CONFIDENCE_KEY = "ai_quant_ai_confidence_pct_v1";
const TRADE_MODE_KEY = "ai_quant_trade_mode_v1";
const LOG_LIMIT = 150;

const LOG_UPDATE_INTERVAL_OPTIONS: {
  label: string;
  value: LogUpdateIntervalValue;
  ms: number;
}[] = [
  { label: "Realtime", value: "realtime", ms: 0 },
  { label: "5 sec", value: "5sec", ms: 5000 },
  { label: "30 sec", value: "30sec", ms: 30000 },
  { label: "1 min", value: "1min", ms: 60000 },
];

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
  return `${Math.round(n).toLocaleString("ko-KR")} KRW`;
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

function getLogTime() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function createLog(type: LogType, message: string): ActivityLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    time: getLogTime(),
    message,
  };
}

function getLogUpdateInterval(value: string | null): LogUpdateIntervalValue {
  return LOG_UPDATE_INTERVAL_OPTIONS.some((option) => option.value === value)
    ? (value as LogUpdateIntervalValue)
    : "realtime";
}

function getLogUpdateIntervalMs(value: LogUpdateIntervalValue) {
  return (
    LOG_UPDATE_INTERVAL_OPTIONS.find((option) => option.value === value)?.ms ?? 0
  );
}
function getLogUpdateIntervalLabel(value: LogUpdateIntervalValue) {
  return (
    LOG_UPDATE_INTERVAL_OPTIONS.find((option) => option.value === value)
      ?.label ?? "Realtime"
  );
}

function getStoredTradeMode(value: string | null): TradeMode {
  return value === "LIVE" ? "LIVE" : "PAPER";
}

function getLogTypeClass(type: LogType) {
  if (type === "BUY") return "text-emerald-300";
  if (type === "SELL") return "text-rose-300";
  if (type === "ERROR") return "text-yellow-300";
  return "text-slate-400";
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
    const parsed = JSON.parse(raw) as Partial<PaperAccount>;

    return {
      cash: safeNumber(parsed.cash, 10_000_000),
      positions: Array.isArray(parsed.positions)
        ? parsed.positions.map((p) => {
            const position = p as Partial<Position>;

            return {
              market: String(position.market),
              qty: safeNumber(position.qty),
              avgPrice: safeNumber(position.avgPrice),
              investedKrw: safeNumber(position.investedKrw),
              openedAt: position.openedAt ?? new Date().toISOString(),
              probability: safeNumber(position.probability),
            };
          })
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
  const [liveExchange, setLiveExchange] = useState<ExchangeName>("upbit");
  const [liveOrderAmount, setLiveOrderAmount] = useState("10000");
  const [liveTradingConfirmed, setLiveTradingConfirmed] = useState(false);

  const [orderKrw, setOrderKrw] = useState("10000000");
  const [maxPositions, setMaxPositions] = useState("3");
  const [cycleSec, setCycleSec] = useState("10");
  const [aiConfidencePct, setAiConfidencePct] = useState(() => {
    if (typeof window === "undefined") return "70";
    return localStorage.getItem(AI_CONFIDENCE_KEY) || "70";
  });
  const [stopLossPct, setStopLossPct] = useState("3");
  const [takeProfitPct, setTakeProfitPct] = useState("5");

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logUpdateInterval, setLogUpdateInterval] =
    useState<LogUpdateIntervalValue>("realtime");
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<AutoStatus>("IDLE");
  const pendingLogsRef = useRef<ActivityLog[]>([]);
  const logUpdateIntervalRef = useRef<LogUpdateIntervalValue>("realtime");
  const tradeModeRef = useRef<TradeMode>("PAPER");
  const remoteCommandIdRef = useRef(0);
  const logUpdateIntervalMs = getLogUpdateIntervalMs(logUpdateInterval);
  const confidenceTriggerPct = Math.min(
    100,
    Math.max(0, safeNumber(aiConfidencePct, 70)),
  );
  const confidenceTrigger = confidenceTriggerPct / 100;

  useEffect(() => {
    setAccount(loadAccount());
    const savedInterval = getLogUpdateInterval(
      localStorage.getItem(LOG_UPDATE_INTERVAL_KEY),
    );
    setLogUpdateInterval(savedInterval);
    logUpdateIntervalRef.current = savedInterval;
    const savedMode = getStoredTradeMode(localStorage.getItem(TRADE_MODE_KEY));
    setTradeMode(savedMode);
    tradeModeRef.current = savedMode;
    refreshSignals();
  }, []);

  useEffect(() => {
    statusRef.current = autoStatus;
  }, [autoStatus]);

  useEffect(() => {
    tradeModeRef.current = tradeMode;
  }, [tradeMode]);

  useEffect(() => {
    localStorage.setItem(AI_CONFIDENCE_KEY, String(confidenceTriggerPct));
  }, [confidenceTriggerPct]);

  useEffect(() => {
    const syncLogUpdateInterval = () => {
      setLogUpdateInterval(
        getLogUpdateInterval(localStorage.getItem(LOG_UPDATE_INTERVAL_KEY)),
      );
      const nextMode = getStoredTradeMode(localStorage.getItem(TRADE_MODE_KEY));
      setTradeMode(nextMode);
      tradeModeRef.current = nextMode;
    };

    window.addEventListener("storage", syncLogUpdateInterval);
    window.addEventListener("focus", syncLogUpdateInterval);

    return () => {
      window.removeEventListener("storage", syncLogUpdateInterval);
      window.removeEventListener("focus", syncLogUpdateInterval);
    };
  }, []);

  const flushPendingLogs = () => {
    if (pendingLogsRef.current.length === 0) return;

    setLogs((prev) => {
      const next = [...pendingLogsRef.current, ...prev].slice(0, LOG_LIMIT);
      pendingLogsRef.current = [];
      return next;
    });
  };

  useEffect(() => {
    logUpdateIntervalRef.current = logUpdateInterval;

    if (logUpdateIntervalMs === 0) {
      flushPendingLogs();
      return;
    }

    const timer = setInterval(flushPendingLogs, logUpdateIntervalMs);
    return () => clearInterval(timer);
  }, [logUpdateInterval, logUpdateIntervalMs]);

  useEffect(() => {
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, []);

  useEffect(() => {
    void loadTradeMode();

    const timer = setInterval(() => {
      void loadTradeMode();
    }, 5000);

    return () => clearInterval(timer);
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

  const isTradeTriggerSignal = (signal: AiSignal) => {
    return (
      !signal.error &&
      safeNumber(signal.signal) === 1 &&
      safeNumber(signal.probability) >= confidenceTrigger
    );
  };

  const buySignals = useMemo(() => {
    return signals
      .filter(
        (signal) =>
          !signal.error &&
          safeNumber(signal.signal) === 1 &&
          safeNumber(signal.probability) >= confidenceTrigger,
      )
      .sort((a, b) => safeNumber(b.probability) - safeNumber(a.probability));
  }, [signals, confidenceTrigger]);

  const bestSignal = buySignals[0];

  const sendTelegramAlert = async (payload: {
    type: "BUY" | "SELL" | "ERROR";
    market?: string;
    price?: number;
    exitPrice?: number;
    probability?: number;
    pnl?: number;
    message?: string;
  }) => {
    const token = getAccessToken();

    if (!token) return;

    try {
      await fetch("/api/telegram/alert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Telegram alerts are best-effort and should not block trading.
    }
  };

  const addLog = (type: LogType, message: string) => {
    const nextLog = createLog(type, message);

    if (type === "ERROR") {
      void sendTelegramAlert({
        type: "ERROR",
        message,
      });
    }

    if (getLogUpdateIntervalMs(logUpdateIntervalRef.current) === 0) {
      setLogs((prev) => [nextLog, ...prev].slice(0, LOG_LIMIT));
      return;
    }

    pendingLogsRef.current = [nextLog, ...pendingLogsRef.current].slice(
      0,
      LOG_LIMIT,
    );
  };

  const updateAccount = (next: PaperAccount) => {
    saveAccount(next);
    setAccount(next);
  };

  const getAccessToken = () => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("token") || "";
  };

  const saveTradeMode = async (nextMode: TradeMode) => {
    setTradeMode(nextMode);
    tradeModeRef.current = nextMode;
    localStorage.setItem(TRADE_MODE_KEY, nextMode);

    const token = getAccessToken();
    if (!token) return;

    try {
      await fetch("/api/trading-mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: nextMode }),
      });
    } catch {
      addLog("ERROR", "trading mode sync failed");
    }
  };

  const loadTradeMode = async () => {
    const token = getAccessToken();
    if (!token) return;

    try {
      const res = await fetch("/api/trading-mode", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        mode?: TradeMode;
      };

      if (res.ok) {
        const nextMode = getStoredTradeMode(data.mode || "PAPER");
        setTradeMode(nextMode);
        tradeModeRef.current = nextMode;
        localStorage.setItem(TRADE_MODE_KEY, nextMode);
      }
    } catch {
      // Mode sync is best-effort. Local mode still controls the screen.
    }
  };

  const persistTradeLog = async (payload: {
    side: "BUY" | "SELL" | "HOLD" | "ERROR";
    market: string;
    signal?: string;
    probability?: number;
    price?: number;
    entryPrice?: number;
    exitPrice?: number;
    pnl?: number;
  }) => {
    const token = getAccessToken();
    if (!token) return;

    try {
      await fetch("/api/trade-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: tradeModeRef.current,
          ...payload,
        }),
      });
    } catch {
      // Trade log persistence should not block the engine.
    }
  };

  const persistAiDecisionLogs = async (list: AiSignal[]) => {
    const token = getAccessToken();
    if (!token || list.length === 0) return;

    try {
      await fetch("/api/ai-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          logs: list.map((signal) => {
            const trendProbability = safeNumber(
              signal.trendProbability ?? signal.trend_probability,
              safeNumber(signal.probability),
            );
            const finalDecision = isTradeTriggerSignal(signal)
              ? "BUY"
              : safeNumber(signal.signal) === 1
                ? "HOLD"
                : "HOLD";

            return {
              market: signal.market,
              rsi: safeNumber(signal.rsi),
              volume: safeNumber(signal.volume),
              trendProbability,
              confidence: confidenceTrigger,
              finalDecision,
              mode: tradeModeRef.current,
            };
          }),
        }),
      });
    } catch {
      // AI decision logging is best-effort.
    }
  };

  const executeLiveOrder = async (params: {
    side: "BUY" | "SELL";
    market: string;
    quoteAmount?: number;
    baseAmount?: number;
  }) => {
    if (!liveTradingConfirmed) {
      addLog("ERROR", "LIVE trading confirmation is required");
      return null;
    }

    const token = getAccessToken();

    if (!token) {
      addLog("ERROR", "login token missing. Please login again");
      return null;
    }

    const res = await fetch("/api/exchange/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        exchange: liveExchange,
        market: params.market,
        side: params.side,
        quoteAmount: params.quoteAmount,
        baseAmount: params.baseAmount,
        confirmText: "LIVE_TRADE",
      }),
    });

    const data = (await res.json()) as LiveOrderResponse;

    if (!res.ok || !data.success) {
      addLog("ERROR", data.error || "LIVE order failed");
      return null;
    }

    return data;
  };

  const executePaperDbOrder = async (params: {
    side: "BUY" | "SELL";
    market: string;
    amount: number;
    probability?: number;
  }) => {
    const token = getAccessToken();

    if (!token) return;

    try {
      const res = await fetch("/api/paper/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          exchange: "paper",
          market: params.market,
          side: params.side,
          amount: params.amount,
          probability: params.probability,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        addLog("ERROR", data.error || "paper order DB sync failed");
      }
    } catch {
      addLog("ERROR", "paper order DB sync failed");
    }
  };

  const executeLiveBuy = async (signal: AiSignal) => {
    const live = loadAccount();

    if (hasPosition(signal.market, live)) {
      addLog("INFO", `already tracking ${signal.market}`);
      return false;
    }

    if (live.positions.length >= safeNumber(maxPositions, 1)) {
      addLog("INFO", "max positions reached");
      return false;
    }

    const quoteAmount = safeNumber(liveOrderAmount, 0);
    const signalPrice = safeNumber(signal.price);

    if (quoteAmount <= 0) {
      addLog("ERROR", "LIVE order amount must be greater than 0");
      return false;
    }

    if (signalPrice <= 0) {
      addLog("ERROR", `invalid price ${signal.market}`);
      return false;
    }

    const order = await executeLiveOrder({
      side: "BUY",
      market: signal.market,
      quoteAmount,
    });

    if (!order) return false;

    const qty = safeNumber(order.filled, quoteAmount / signalPrice);

    const position: Position = {
      market: signal.market,
      qty,
      avgPrice: signalPrice,
      investedKrw: quoteAmount,
      openedAt: new Date().toISOString(),
      probability: safeNumber(signal.probability),
    };

    const trade: TradeHistoryItem = {
      id: `${Date.now()}-${signal.market}-LIVE-BUY`,
      type: "BUY",
      market: signal.market,
      qty,
      price: signalPrice,
      krw: quoteAmount,
      probability: safeNumber(signal.probability),
      createdAt: new Date().toISOString(),
    };

    updateAccount({
      cash: live.cash,
      positions: [position, ...live.positions],
      history: [trade, ...live.history],
    });

    addLog(
      "BUY",
      `LIVE BUY ${liveExchange.toUpperCase()} ${order.symbol || signal.market} / amount ${quoteAmount.toLocaleString("ko-KR")} / status ${order.status || "submitted"}`,
    );
    void sendTelegramAlert({
      type: "BUY",
      market: signal.market.replace("KRW-", ""),
      price: signalPrice,
      probability: safeNumber(signal.probability),
    });

    return true;
  };

  const executeLiveSell = async (market: string, reason: string) => {
    const live = loadAccount();
    const position = live.positions.find((p) => p.market === market);

    if (!position) return false;

    const signal = signalMap[market];
    const price = safeNumber(signal?.price, position.avgPrice);
    const value = position.qty * price;
    const pnl = value - position.investedKrw;
    const pnlPct =
      position.investedKrw > 0 ? (pnl / position.investedKrw) * 100 : 0;

    const order = await executeLiveOrder({
      side: "SELL",
      market,
      baseAmount: position.qty,
    });

    if (!order) return false;

    const trade: TradeHistoryItem = {
      id: `${Date.now()}-${market}-LIVE-SELL`,
      type: "SELL",
      market,
      qty: position.qty,
      price,
      krw: value,
      pnl,
      probability: safeNumber(signal?.probability),
      createdAt: new Date().toISOString(),
    };

    updateAccount({
      cash: live.cash,
      positions: live.positions.filter((p) => p.market !== market),
      history: [trade, ...live.history],
    });

    addLog(
      "SELL",
      `LIVE SELL ${liveExchange.toUpperCase()} ${order.symbol || market} / ${reason} / pnl ${pnl >= 0 ? "+" : ""}${formatKrw(pnl)}`,
    );
    void sendTelegramAlert({
      type: "SELL",
      market: market.replace("KRW-", ""),
      exitPrice: price,
      pnl: pnlPct,
    });

    return true;
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
      void persistAiDecisionLogs(list as AiSignal[]);

      const active = list.filter(isTradeTriggerSignal);
      addLog(
        "INFO",
        `AI signal updated / ${active.length} trigger signal / ${list.length} markets / min confidence ${confidenceTriggerPct}%`,
      );

      return list as AiSignal[];
    } catch {
      addLog("ERROR", "AI signal fetch failed. Check the Flask AI server.");
      void persistTradeLog({
        side: "ERROR",
        market: "AI",
        signal: "ERROR",
      });
      return [];
    }
  };

  const hasPosition = (market: string, source?: PaperAccount) => {
    const live = source ?? loadAccount();
    return live.positions.some((p) => p.market === market);
  };

  const executePaperBuy = (signal: AiSignal, krw: number) => {
    const live = loadAccount();

    if (tradeModeRef.current !== "PAPER") {
      addLog("ERROR", "PAPER buy is blocked while LIVE mode is selected");
      return false;
    }

    if (hasPosition(signal.market, live)) {
      addLog("INFO", `already holding ${signal.market}`);
      return false;
    }

    if (live.positions.length >= safeNumber(maxPositions, 1)) {
      addLog("INFO", "max positions reached");
      return false;
    }

    const price = safeNumber(signal.price);
    if (price <= 0) {
      addLog("ERROR", `invalid price ${signal.market}`);
      return false;
    }

    const orderAmount = Math.min(krw, live.cash);
    if (orderAmount <= 0) {
      addLog("ERROR", "insufficient paper cash");
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
      "BUY",
      `PAPER BUY ${signal.market} / ${formatKrw(orderAmount)} / prob ${formatProb(signal.probability)}`,
    );
    void executePaperDbOrder({
      side: "BUY",
      market: signal.market,
      amount: orderAmount,
      probability: safeNumber(signal.probability),
    });
    void sendTelegramAlert({
      type: "BUY",
      market: signal.market.replace("KRW-", ""),
      price,
      probability: safeNumber(signal.probability),
    });

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
    const pnlPct =
      position.investedKrw > 0 ? (pnl / position.investedKrw) * 100 : 0;

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
      "SELL",
      `PAPER SELL ${market} / ${reason} / pnl ${pnl >= 0 ? "+" : ""}${formatKrw(pnl)}`,
    );
    void executePaperDbOrder({
      side: "SELL",
      market,
      amount: value,
      probability: safeNumber(signal?.probability),
    });
    void sendTelegramAlert({
      type: "SELL",
      market: market.replace("KRW-", ""),
      exitPrice: price,
      pnl: pnlPct,
    });

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
      const positionValue = position.qty * nowPrice;
      const pnl = positionValue - position.investedKrw;
      const pnlPct =
        position.avgPrice > 0
          ? ((nowPrice - position.avgPrice) / position.avgPrice) * 100
          : 0;

      if (pnlPct <= -safeNumber(stopLossPct, 3)) {
        if (tradeModeRef.current === "LIVE") {
          await executeLiveSell(
            position.market,
            `stop loss ${formatPct(pnlPct)}`,
          );
        } else {
          executePaperSell(position.market, `stop loss ${formatPct(pnlPct)}`);
        }
        continue;
      }

      if (pnlPct >= safeNumber(takeProfitPct, 5)) {
        if (tradeModeRef.current === "LIVE") {
          await executeLiveSell(
            position.market,
            `take profit ${formatPct(pnlPct)}`,
          );
        } else {
          executePaperSell(position.market, `take profit ${formatPct(pnlPct)}`);
        }
        continue;
      }

      if (nowSignal && safeNumber(nowSignal.signal) === 0) {
        addLog(
          "INFO",
          `HOLD ${position.market} / pnl ${formatPct(pnlPct)} / AI signal off`,
        );
        void persistTradeLog({
          side: "HOLD",
          market: position.market,
          signal: "HOLD",
          probability: safeNumber(nowSignal.probability),
          price: nowPrice,
          pnl,
        });
      } else {
        addLog(
          "INFO",
          `HOLD ${position.market} / pnl ${formatPct(pnlPct)} / AI signal active`,
        );
        void persistTradeLog({
          side: "HOLD",
          market: position.market,
          signal: "HOLD",
          probability: safeNumber(nowSignal?.probability),
          price: nowPrice,
          pnl,
        });
      }
    }

    const candidates = latestSignals
      .filter(isTradeTriggerSignal)
      .sort((a, b) => safeNumber(b.probability) - safeNumber(a.probability));

    const current = loadAccount();

    for (const signal of candidates) {
      if (current.positions.length >= safeNumber(maxPositions, 1)) break;
      if (hasPosition(signal.market)) continue;

      if (tradeModeRef.current === "LIVE") {
        await executeLiveBuy(signal);
      } else {
        executePaperBuy(signal, safeNumber(orderKrw, 0));
      }
      break;
    }

    if (candidates.length === 0) {
      addLog(
        "INFO",
        `no AI trigger signal. min confidence ${confidenceTriggerPct}%`,
      );
      void persistTradeLog({
        side: "HOLD",
        market: "AI",
        signal: "HOLD",
      });
    }
  };

  const startAutoTrading = async () => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }

    if (tradeModeRef.current === "LIVE" && !liveTradingConfirmed) {
      addLog("ERROR", "Enable LIVE trading confirmation before start");
      return;
    }

    setAutoStatus("RUNNING");
    statusRef.current = "RUNNING";

    addLog(
      "INFO",
      `${tradeModeRef.current} engine started / ${
        tradeModeRef.current === "LIVE"
          ? `${liveExchange.toUpperCase()} amount ${safeNumber(liveOrderAmount).toLocaleString("ko-KR")}`
          : `order ${formatKrw(orderKrw)}`
      } / confidence ${confidenceTriggerPct}% / cycle ${cycleSec}s`,
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
    addLog("INFO", "engine paused");
  };

  const stopAutoTrading = () => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }

    setAutoStatus("STOPPED");
    statusRef.current = "STOPPED";
    addLog("INFO", "engine stopped");
  };

  const closeAllPositions = async () => {
    const live = loadAccount();

    for (const position of live.positions) {
      if (tradeModeRef.current === "LIVE") {
        await executeLiveSell(position.market, "manual close all");
      } else {
        executePaperSell(position.market, "manual close all");
      }
    }
  };

  const resetAccount = async () => {
    if (loopRef.current) clearInterval(loopRef.current);

    const fresh = getDefaultAccount();
    saveAccount(fresh);
    setAccount(fresh);
    setAutoStatus("IDLE");
    statusRef.current = "IDLE";
    setLogs([]);
    pendingLogsRef.current = [];
    addLog("INFO", "paper account reset");

    const token = getAccessToken();
    if (!token) return;

    try {
      await fetch("/api/paper/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          virtualBalance: 10_000_000,
        }),
      });
    } catch {
      addLog("ERROR", "paper account DB reset failed");
    }
  };

  useEffect(() => {
    const pollTradingControl = async () => {
      const token = getAccessToken();

      if (!token) return;

      try {
        const res = await fetch("/api/trading-control", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return;

        const data = (await res.json()) as {
          commandId?: number;
          lastCommand?:
            | "START"
            | "START_PAPER"
            | "START_LIVE"
            | "PAUSE"
            | "STOP"
            | "CLOSE_ALL"
            | null;
        };
        const commandId = safeNumber(data.commandId, 0);

        if (!data.lastCommand || commandId <= remoteCommandIdRef.current) {
          return;
        }

        remoteCommandIdRef.current = commandId;

        if (data.lastCommand === "START") {
          addLog("INFO", "Telegram remote command: START");
          await startAutoTrading();
          return;
        }

        if (data.lastCommand === "START_PAPER") {
          addLog("INFO", "Telegram remote command: START PAPER");
          await saveTradeMode("PAPER");
          await startAutoTrading();
          return;
        }

        if (data.lastCommand === "START_LIVE") {
          addLog("INFO", "Telegram remote command: START LIVE");
          await saveTradeMode("LIVE");
          await startAutoTrading();
          return;
        }

        if (data.lastCommand === "PAUSE") {
          addLog("INFO", "Telegram remote command: PAUSE");
          pauseAutoTrading();
          return;
        }

        if (data.lastCommand === "STOP") {
          addLog("INFO", "Telegram remote command: STOP");
          stopAutoTrading();
          return;
        }

        if (data.lastCommand === "CLOSE_ALL") {
          addLog("INFO", "Telegram remote command: CLOSE ALL");
          await closeAllPositions();
        }
      } catch {
        // Remote control polling should never block the trading UI.
      }
    };

    const timer = setInterval(() => {
      void pollTradingControl();
    }, 2500);

    void pollTradingControl();

    return () => clearInterval(timer);
  }, [tradeMode, liveTradingConfirmed, liveExchange, liveOrderAmount]);

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
                Run AI-driven auto trading in PAPER or LIVE mode. PAPER mode
                uses virtual KRW only, while LIVE mode requires explicit confirmation.
              </p>
            </div>

            <div className="flex rounded-2xl border border-slate-800 bg-[#111A2E] p-1">
              <button
                onClick={() => void saveTradeMode("PAPER")}
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
                  void saveTradeMode("LIVE");
                  addLog("INFO", "Live mode selected. Confirm LIVE trading before start");
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  tradeMode === "LIVE"
                    ? "bg-rose-500/20 text-rose-300"
                    : "text-slate-400"
                }`}
              >
                Live
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
                    const active = isTradeTriggerSignal(s);
                    const serverBuy = safeNumber(s.signal) === 1;

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
                            {active
                              ? "TRIGGER"
                              : serverBuy
                                ? "LOW CONF"
                                : "WAIT"}
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
                <label className="text-xs text-slate-400">
                  AI Confidence %
                </label>
                <input
                  value={aiConfidencePct}
                  onChange={(e) => setAiConfidencePct(e.target.value)}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
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
              <div className="col-span-2 rounded-2xl border border-slate-800 bg-[#111A2E] p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>AI trade trigger</span>
                  <span className="font-semibold text-emerald-300">
                    {confidenceTriggerPct.toFixed(0)}%
                  </span>
                </div>
                <input
                  value={confidenceTriggerPct}
                  onChange={(e) => setAiConfidencePct(e.target.value)}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  className="mt-3 w-full accent-emerald-400"
                />
                <div className="mt-2 text-xs leading-relaxed text-slate-500">
                  AI signal must be BUY and probability must be at least this
                  value before PAPER or LIVE auto trading enters a position.
                </div>
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
              {tradeMode === "LIVE" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400">
                      Live Exchange
                    </label>
                    <select
                      value={liveExchange}
                      onChange={(e) =>
                        setLiveExchange(e.target.value as ExchangeName)
                      }
                      className="mt-2 h-11 w-full rounded-2xl border border-slate-800 bg-[#111A2E] px-3 text-sm outline-none"
                    >
                      <option value="upbit">Upbit</option>
                      <option value="binance">Binance</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">
                      Live Order Amount
                    </label>
                    <input
                      value={liveOrderAmount}
                      onChange={(e) => setLiveOrderAmount(e.target.value)}
                      type="number"
                      min={0}
                      className="mt-2 h-11 w-full rounded-2xl border border-slate-800 bg-[#111A2E] px-3 text-sm outline-none"
                    />
                  </div>
                  <label className="col-span-2 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                    <input
                      type="checkbox"
                      checked={liveTradingConfirmed}
                      onChange={(e) =>
                        setLiveTradingConfirmed(e.target.checked)
                      }
                      className="mt-1"
                    />
                    <span>
                      I understand LIVE mode sends real market orders to my
                      exchange account.
                    </span>
                  </label>
                </>
              )}
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
              onClick={() => void resetAccount()}
              className="h-11 w-full rounded-2xl border border-slate-700 bg-[#111A2E] text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              Reset Paper Account
            </button>

            <div className="rounded-2xl border border-slate-800 bg-[#111A2E] p-4 text-sm text-slate-400">
              Best Trigger:{" "}
              <span className="font-semibold text-slate-100">
                {bestSignal
                  ? `${bestSignal.market} / ${formatProb(bestSignal.probability)}`
                  : "No Trigger Signal"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card
          title={tradeMode === "LIVE" ? "Live Position Tracker" : "Paper Portfolio"}
          className="xl:col-span-8"
        >
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
                no active position
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
                      onClick={() => {
                        if (tradeModeRef.current === "LIVE") {
                          void executeLiveSell(p.market, "manual");
                        } else {
                          executePaperSell(p.market, "manual");
                        }
                      }}
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

        <Card
          title="Activity Log"
          className="xl:col-span-4"
          right={
            <span className="rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-1 text-xs text-slate-400">
              {getLogUpdateIntervalLabel(logUpdateInterval)}
            </span>
          }
        >
          <div className="max-h-[520px] overflow-auto text-xs text-slate-300">
            {logs.length === 0 ? (
              <div className="text-slate-500">no activity yet</div>
            ) : (
              <ul className="space-y-2">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="grid grid-cols-[72px_48px_1fr] gap-2 whitespace-pre-wrap rounded-xl border border-slate-800 bg-[#111A2E]/70 px-3 py-2"
                  >
                    <span className="font-mono text-slate-500">
                      [{log.time}]
                    </span>
                    <span className={`font-bold ${getLogTypeClass(log.type)}`}>
                      {log.type}
                    </span>
                    <span className="text-slate-300">{log.message}</span>
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
