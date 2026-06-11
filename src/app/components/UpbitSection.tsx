"use client";

import { useEffect, useMemo, useState } from "react";

type UpbitAsset = {
  currency: string;
  balance: number;
  locked: number;
  totalQty: number;
  avgBuyPrice: number;
  currentPrice: number | null;
  estimatedKrw: number | null;
  unitCurrency: string;
};

type UpbitBalanceResponse = {
  ok: boolean;
  exchange: "upbit";
  accountId: string;
  keyLast4: string;
  krwCash: number;
  totalEstimatedKrw: number;
  assets: UpbitAsset[];
  fetchedAt: string;
};

function formatKrw(value?: number | null) {
  if (value == null) return "-";
  return `₩ ${Math.round(value).toLocaleString()}`;
}

function getAccessToken() {
  const token = localStorage.getItem("token");

  if (!token) {
    throw new Error("로그인이 필요합니다.");
  }

  return token;
}

async function saveUpbitAccount(params: {
  accountName: string;
  accessKey: string;
  secretKey: string;
}) {
  const token = getAccessToken();

  const res = await fetch("/api/exchange/save-key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      exchange: "upbit",
      accountName: params.accountName,
      apiKey: params.accessKey,
      secretKey: params.secretKey,
    }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json?.error || "업비트 계정 저장 실패");
  }

  return json;
}

async function fetchUpbitBalance() {
  const token = getAccessToken();

  const res = await fetch("/api/exchange/balance", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json?.error || "업비트 잔고 조회 실패");
  }

  const upbitData = Array.isArray(json)
    ? json.find((item) => item.exchange === "upbit")
    : null;

  if (!upbitData) {
    throw new Error("업비트 데이터가 없습니다.");
  }

  return {
    ok: true,
    exchange: "upbit",
    accountId: "",
    keyLast4: "",
    krwCash:
      upbitData?.balance?.total?.KRW || upbitData?.balance?.free?.KRW || 0,
    totalEstimatedKrw:
      upbitData?.balance?.total?.KRW || upbitData?.balance?.free?.KRW || 0,
    assets: Object.keys(upbitData?.balance?.total || {}).map((currency) => ({
      currency,
      balance: Number(upbitData.balance.free?.[currency] || 0),
      locked: Number(upbitData.balance.used?.[currency] || 0),
      totalQty: Number(upbitData.balance.total?.[currency] || 0),
      avgBuyPrice: 0,
      currentPrice: null,
      estimatedKrw: null,
      unitCurrency: "KRW",
    })),
    fetchedAt: new Date().toISOString(),
  } as UpbitBalanceResponse;
}

export function UpbitConnectionSection() {
  const [accountName, setAccountName] = useState("Upbit Main");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const [saveLoading, setSaveLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState<UpbitBalanceResponse | null>(null);

  const nonKrwAssets = useMemo(
    () => balance?.assets?.filter((item) => item.currency !== "KRW") ?? [],
    [balance],
  );

  const handleSave = async () => {
    try {
      if (!accessKey.trim() || !secretKey.trim()) {
        setMessage("업비트 Access Key와 Secret Key를 입력해주세요.");
        return;
      }

      setSaveLoading(true);
      setMessage("");

      await saveUpbitAccount({
        accountName: accountName.trim() || "Upbit Main",
        accessKey: accessKey.trim(),
        secretKey: secretKey.trim(),
      });

      setAccessKey("");
      setSecretKey("");

      setMessage("업비트 키가 저장되었습니다.");

      await handleLoadBalance();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleLoadBalance = async () => {
    try {
      setBalanceLoading(true);
      setMessage("");

      const data = await fetchUpbitBalance();

      setBalance(data);
    } catch (error) {
      setBalance(null);

      setMessage(error instanceof Error ? error.message : "잔고 조회 실패");
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    handleLoadBalance().catch(() => {});
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0f172a]/60 p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white md:text-lg">
            Upbit 연동
          </h3>

          <p className="mt-1 text-xs text-slate-400 md:text-sm">
            사용자가 직접 API 키를 저장하고 잔고를 불러옵니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadBalance}
          disabled={balanceLoading}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {balanceLoading ? "불러오는 중..." : "잔고 새로고침"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <input
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="계정 이름"
          className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />

        <input
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          placeholder="Upbit Access Key"
          className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />

        <input
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder="Upbit Secret Key"
          className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saveLoading}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveLoading ? "저장 중..." : "업비트 키 저장"}
        </button>
      </div>

      {message ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
          {message}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-xs text-slate-400">총 추정 자산</p>

          <p className="mt-2 text-xl font-bold text-white md:text-2xl">
            {formatKrw(balance?.totalEstimatedKrw)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
          <p className="text-xs text-slate-400">보유 KRW</p>

          <p className="mt-2 text-xl font-bold text-white md:text-2xl">
            {formatKrw(balance?.krwCash)}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-5 bg-white/10 px-4 py-3 text-xs font-medium text-slate-300">
          <div>코인</div>
          <div>수량</div>
          <div>평균매수가</div>
          <div>현재가</div>
          <div>평가금액</div>
        </div>

        {nonKrwAssets.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            표시할 코인 자산이 없습니다.
          </div>
        ) : (
          nonKrwAssets.map((item) => (
            <div
              key={item.currency}
              className="grid grid-cols-5 border-t border-white/10 px-4 py-3 text-sm text-white"
            >
              <div className="truncate font-medium">{item.currency}</div>

              <div className="truncate">{item.totalQty.toLocaleString()}</div>

              <div className="truncate">{formatKrw(item.avgBuyPrice)}</div>

              <div className="truncate">{formatKrw(item.currentPrice)}</div>

              <div className="truncate">{formatKrw(item.estimatedKrw)}</div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          연결 키: {balance?.keyLast4 ? `••••${balance.keyLast4}` : "-"}
        </span>

        <span>
          마지막 조회:{" "}
          {balance?.fetchedAt
            ? new Date(balance.fetchedAt).toLocaleString()
            : "-"}
        </span>
      </div>
    </section>
  );
}
