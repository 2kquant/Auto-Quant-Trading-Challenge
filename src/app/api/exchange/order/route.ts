import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { createPrivateExchange, ExchangeName } from "@/lib/exchange/ccxt";

type JwtPayload = {
  id?: string;
  userId?: string;
  email?: string;
};

type OrderSide = "BUY" | "SELL";

type LiveOrderRequest = {
  exchange?: string;
  market?: string;
  side?: string;
  quoteAmount?: number;
  baseAmount?: number;
  confirmText?: string;
};

type ExchangeOrderResult = {
  id?: string;
  symbol?: string;
  side?: string;
  type?: string;
  status?: string;
  filled?: number;
  amount?: number;
  cost?: number;
  average?: number;
  price?: number;
};

type PrivateExchange = ReturnType<typeof createPrivateExchange> & {
  createMarketBuyOrderWithCost?: (
    symbol: string,
    cost: number,
    params?: Record<string, unknown>,
  ) => Promise<ExchangeOrderResult>;
  createMarketSellOrder?: (
    symbol: string,
    amount: number,
    params?: Record<string, unknown>,
  ) => Promise<ExchangeOrderResult>;
};

type TradeLogDelegate = {
  create: (args: {
    data: {
      userId: string;
      mode: "LIVE";
      market: string;
      side: string;
      signal: string;
      price?: number | null;
      entryPrice?: number | null;
      exitPrice?: number | null;
      pnl?: number | null;
    };
  }) => Promise<unknown>;
};

type PrismaWithTradeLog = typeof prisma & {
  tradeLog: TradeLogDelegate;
};

function getUserId(req: NextRequest) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cookieToken = req.cookies.get("token")?.value;
  const token = authToken || cookieToken;

  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

  return decoded.id || decoded.userId || null;
}

function normalizeExchange(value: string): ExchangeName | null {
  const exchange = value.toLowerCase().trim();

  if (exchange === "upbit" || exchange === "binance") return exchange;

  return null;
}

function normalizeSide(value: string): OrderSide | null {
  const side = value.toUpperCase().trim();

  if (side === "BUY" || side === "SELL") return side;

  return null;
}

function toCcxtSymbol(exchange: ExchangeName, market: string) {
  const raw = market.trim().toUpperCase();

  if (!raw) return "";
  if (raw.includes("/")) return raw;

  if (exchange === "upbit") {
    if (raw.includes("-")) {
      const [quote, base] = raw.split("-");
      return `${base}/${quote}`;
    }

    if (raw.endsWith("USDT")) {
      return `${raw.replace("USDT", "")}/KRW`;
    }

    return `${raw.replace("KRW", "")}/KRW`;
  }

  if (raw.includes("-")) {
    const [, base] = raw.split("-");
    return `${base}/USDT`;
  }

  if (raw.endsWith("USDT")) {
    return `${raw.replace("USDT", "")}/USDT`;
  }

  return `${raw}/USDT`;
}

function toNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

async function executeMarketBuy(params: {
  exchange: PrivateExchange;
  symbol: string;
  quoteAmount: number;
}) {
  const { exchange, symbol, quoteAmount } = params;

  if (typeof exchange.createMarketBuyOrderWithCost === "function") {
    return exchange.createMarketBuyOrderWithCost(symbol, quoteAmount);
  }

  throw new Error("Quote amount market buy is not supported by this exchange adapter.");
}

async function executeMarketSell(params: {
  exchange: PrivateExchange;
  symbol: string;
  baseAmount: number;
}) {
  const { exchange, symbol, baseAmount } = params;

  if (typeof exchange.createMarketSellOrder === "function") {
    return exchange.createMarketSellOrder(symbol, baseAmount);
  }

  return exchange.createOrder(symbol, "market", "sell", baseAmount);
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = (await req.json()) as LiveOrderRequest;
    const exchangeName = normalizeExchange(String(body.exchange || ""));
    const side = normalizeSide(String(body.side || ""));
    const market = String(body.market || "").trim();

    if (!exchangeName || !side || !market) {
      return NextResponse.json(
        { error: "거래소, 마켓, 주문 방향을 확인해주세요." },
        { status: 400 },
      );
    }

    if (body.confirmText !== "LIVE_TRADE") {
      return NextResponse.json(
        { error: "실거래 확인 값이 필요합니다." },
        { status: 400 },
      );
    }

    const quoteAmount = toNumber(body.quoteAmount);
    const baseAmount = toNumber(body.baseAmount);

    if (side === "BUY" && quoteAmount <= 0) {
      return NextResponse.json(
        { error: "매수 주문 금액은 0보다 커야 합니다." },
        { status: 400 },
      );
    }

    if (side === "SELL" && baseAmount <= 0) {
      return NextResponse.json(
        { error: "매도 주문 수량은 0보다 커야 합니다." },
        { status: 400 },
      );
    }

    const key = await prisma.exchangeApiKey.findUnique({
      where: {
        userId_exchange: {
          userId,
          exchange: exchangeName,
        },
      },
    });

    if (!key) {
      return NextResponse.json(
        { error: `${exchangeName.toUpperCase()} API Key가 등록되어 있지 않습니다.` },
        { status: 400 },
      );
    }

    const symbol = toCcxtSymbol(exchangeName, market);
    const exchange = createPrivateExchange(
      exchangeName,
      key.apiKey,
      key.secretKey,
    ) as PrivateExchange;

    await exchange.loadMarkets();

    const marketInfo = exchange.market(symbol);

    if (!marketInfo) {
      return NextResponse.json(
        { error: `${symbol} 마켓을 찾을 수 없습니다.` },
        { status: 400 },
      );
    }

    const order =
      side === "BUY"
        ? await executeMarketBuy({
            exchange,
            symbol,
            quoteAmount,
          })
        : await executeMarketSell({
            exchange,
            symbol,
            baseAmount,
          });

    const average = toNumber(order?.average ?? order?.price);
    const db = prisma as PrismaWithTradeLog;

    await db.tradeLog.create({
      data: {
        userId,
        mode: "LIVE",
        market,
        side,
        signal: side,
        price: average || null,
        entryPrice: side === "BUY" ? average || null : null,
        exitPrice: side === "SELL" ? average || null : null,
      },
    });

    return NextResponse.json({
      success: true,
      exchange: exchangeName,
      inputMarket: market,
      symbol,
      side,
      order,
      filled: toNumber(order?.filled ?? order?.amount),
      average,
      cost: toNumber(order?.cost),
      status: order?.status || "submitted",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "실거래 주문 실패";

    console.error("LIVE_ORDER_POST_ERROR:", err);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
