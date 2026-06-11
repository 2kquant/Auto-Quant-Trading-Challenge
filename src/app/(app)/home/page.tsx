"use client";

import React, { useEffect, useState } from "react";

function Card({
  title,
  children,
  className = "",
  right,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-800/70 bg-[#0F1A2A]/80 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${className}`}
    >
      <div className="flex h-11 items-center justify-between border-b border-slate-800/70 px-4">
        <div className="text-sm font-medium text-slate-100">{title}</div>
        {right}
      </div>

      <div className="h-[calc(100%-44px)] p-4">{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const valueCls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-rose-300"
        : "text-slate-100";

  const chipCls =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : tone === "bad"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : "border-slate-700/60 bg-slate-800/20 text-slate-200";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-[#0F1A2A]/80">
      <div className="flex h-11 items-center justify-between border-b border-slate-800/70 px-4">
        <span className="text-sm text-slate-400">{label}</span>

        <span className={`rounded-lg border px-2 py-1 text-[11px] ${chipCls}`}>
          24H
        </span>
      </div>

      <div className="p-4">
        <div className={`text-2xl font-semibold ${valueCls}`}>{value}</div>

        {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [balances, setBalances] = useState<any[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        setBalanceLoading(true);

        const token = localStorage.getItem("token");

        if (!token) return;

        const res = await fetch("/api/exchange/balance", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();

        setBalances(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("BALANCE_ERROR:", err);
      } finally {
        setBalanceLoading(false);
      }
    };

    fetchBalances();
  }, []);

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-64px-32px)] lg:overflow-hidden">
      <div className="shrink-0 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Home</h1>

          <p className="text-sm text-slate-500">
            자동매매 현황 요약 & 신호 모니터링
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="h-10 rounded-xl border border-slate-800/70 bg-slate-900/25 px-3 text-sm text-slate-200 hover:bg-slate-900/40">
            BTCUSDT
          </button>

          <button className="h-10 rounded-xl border border-slate-800/70 bg-slate-900/25 px-3 text-sm text-slate-200 hover:bg-slate-900/40">
            1m
          </button>

          <button className="h-10 rounded-xl border border-slate-800/70 bg-slate-900/25 px-3 text-sm text-slate-200 hover:bg-slate-900/40">
            Strategy: Momentum
          </button>
        </div>
      </div>

      <div className="shrink-0 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Today's PnL"
          value="+4.4%"
          sub="vs yesterday +1.2%"
          tone="good"
        />

        <KpiCard label="Total ROI" value="+52.3%" sub="All time" />

        <KpiCard
          label="Max Drawdown"
          value="-5.18%"
          sub="Rolling 30D"
          tone="bad"
        />

        <KpiCard label="Win Rate" value="69%" sub="Last 100 trades" />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-8">
          <Card
            title="Equity Curve"
            className="flex-1 min-h-0"
            right={
              <span className="text-xs text-slate-400">
                Updated <span className="text-slate-200">now</span>
              </span>
            }
          >
            <div className="flex h-full items-center justify-center rounded-xl border border-slate-800/70 bg-[#0B1420]/35 text-slate-500">
              {balanceLoading
                ? "잔고 불러오는 중..."
                : balances.length > 0
                  ? `${balances.length}개 거래소 연결됨`
                  : "Chart Placeholder"}
            </div>
          </Card>

          <Card
            title="Open Positions"
            className="flex-1 min-h-0"
            right={<span className="text-xs text-slate-500">Live</span>}
          >
            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-800/70 bg-[#0B1420]/35">
              <div className="grid grid-cols-12 bg-[#0B1420]/55 px-3 py-2 text-[11px] text-slate-500">
                <div className="col-span-3">Exchange</div>
                <div className="col-span-3">Asset</div>
                <div className="col-span-3">Free</div>
                <div className="col-span-3 text-right">Total</div>
              </div>

              {balances.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  연결된 거래소가 없습니다.
                </div>
              ) : (
                balances.map((exchangeItem, i) => {
                  const total = exchangeItem?.balance?.total || {};

                  const assets = Object.keys(total)
                    .filter((asset) => Number(total[asset]) > 0)
                    .slice(0, 3);

                  return assets.map((asset, idx) => (
                    <div
                      key={`${i}-${idx}`}
                      className="grid grid-cols-12 border-t border-slate-800/70 px-3 py-3 text-sm"
                    >
                      <div className="col-span-3 font-semibold text-slate-100">
                        {exchangeItem.exchange}
                      </div>

                      <div className="col-span-3 text-slate-300">{asset}</div>

                      <div className="col-span-3 text-slate-300">
                        {Number(
                          exchangeItem.balance?.free?.[asset] || 0,
                        ).toLocaleString()}
                      </div>

                      <div className="col-span-3 text-right font-semibold text-emerald-300">
                        {Number(
                          exchangeItem.balance?.total?.[asset] || 0,
                        ).toLocaleString()}
                      </div>
                    </div>
                  ));
                })
              )}
            </div>
          </Card>
        </div>

        <div className="flex min-h-0 flex-col gap-4 lg:col-span-4">
          <Card
            title="AI Predictions"
            className="flex-1 min-h-0"
            right={
              <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                Live
              </span>
            }
          >
            <div className="flex h-full min-h-0 flex-col gap-3">
              {[
                {
                  sym: "BTCUSDT",
                  side: "LONG",
                  conf: "72%",
                  note: "Momentum ↑",
                },
                {
                  sym: "ETHUSDT",
                  side: "FLAT",
                  conf: "55%",
                  note: "No edge",
                },
                {
                  sym: "SOLUSDT",
                  side: "SHORT",
                  conf: "68%",
                  note: "Reversal",
                },
              ].map((x, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-800/70 bg-[#0B1420]/45 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">
                      {x.sym}
                    </div>

                    <div
                      className={`rounded-lg border px-2 py-1 text-[11px] ${
                        x.side === "LONG"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : x.side === "SHORT"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                            : "border-slate-700/60 bg-slate-800/20 text-slate-200"
                      }`}
                    >
                      {x.side}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{x.note}</span>

                    <span className="text-slate-300">
                      conf <span className="text-slate-100">{x.conf}</span>
                    </span>
                  </div>
                </div>
              ))}

              <button className="mt-auto h-10 w-full rounded-xl border border-slate-800/70 bg-slate-900/25 text-sm text-slate-200 hover:bg-slate-900/40">
                View all signals
              </button>
            </div>
          </Card>

          <Card title="Alerts / Logs" className="flex-1 min-h-0">
            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-800/70 bg-[#0B1420]/35 p-3 text-xs text-slate-300">
              <div className="space-y-2">
                <div className="text-slate-500">• Connected to Exchange ✅</div>

                <div className="text-slate-500">• Model loaded: Predicting</div>

                <div className="text-slate-500">
                  • Guard enabled: daily loss limit
                </div>

                <div className="text-slate-500">
                  • Signal: BTCUSDT LONG (72%)
                </div>

                <div className="text-slate-500">• Order: MARKET BUY</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="h-10 rounded-xl border border-slate-800/70 bg-slate-900/25 text-sm text-slate-200 hover:bg-slate-900/40">
                  Clear
                </button>

                <button className="h-10 rounded-xl border border-slate-800/70 bg-slate-900/25 text-sm text-slate-200 hover:bg-slate-900/40">
                  Export
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
