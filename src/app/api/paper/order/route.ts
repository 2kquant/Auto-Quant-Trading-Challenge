import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId } from "@/lib/auth/request-user";

const DEFAULT_PAPER_BALANCE = 10_000_000;

type PaperAccountDelegate = {
  upsert: (args: {
    where: { userId: string };
    update: Record<string, never>;
    create: { userId: string; virtualBalance: number; virtualPnl?: number };
  }) => Promise<{ virtualBalance: number; virtualPnl: number }>;
  update: (args: {
    where: { userId: string };
    data: { virtualBalance?: number; virtualPnl?: number };
  }) => Promise<{ virtualBalance: number; virtualPnl: number }>;
};

type TradeLogDelegate = {
  create: (args: {
    data: {
      userId: string;
      mode: "PAPER";
      market: string;
      side: string;
      signal: string;
      probability?: number | null;
      price?: number | null;
      entryPrice?: number | null;
      exitPrice?: number | null;
      pnl?: number | null;
    };
  }) => Promise<unknown>;
};

type PrismaWithPaperTrading = typeof prisma & {
  paperAccount: PaperAccountDelegate;
  tradeLog: TradeLogDelegate;
};

function normalizeSide(value: string) {
  const side = value.toUpperCase().trim();
  return side === "BUY" || side === "SELL" ? side : null;
}

function toBinanceSymbol(market: string) {
  const raw = market.toUpperCase().trim();
  if (raw.includes("-")) {
    const [, base] = raw.split("-");
    return `${base}USDT`;
  }
  if (raw.endsWith("USDT")) return raw;
  if (raw.endsWith("KRW")) return `${raw.replace("KRW", "")}USDT`;
  return `${raw}USDT`;
}

async function getMarketPrice(market: string) {
  const raw = market.toUpperCase().trim();

  if (raw.startsWith("KRW-")) {
    const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${raw}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as Array<{ trade_price?: number }>;
    return Number(data?.[0]?.trade_price || 0);
  }

  const symbol = toBinanceSymbol(raw);
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    { cache: "no-store" },
  );
  const data = (await res.json()) as { price?: string };
  return Number(data.price || 0);
}

export async function POST(req: NextRequest) {
  try {
    const userId = getRequestUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const body = (await req.json()) as {
      exchange?: string;
      symbol?: string;
      market?: string;
      side?: string;
      amount?: number;
      probability?: number;
    };
    const exchange = String(body.exchange || "paper").toLowerCase();
    const market = String(body.market || body.symbol || "").toUpperCase();
    const side = normalizeSide(String(body.side || ""));
    const amount = Number(body.amount || 0);
    const probability = Number(body.probability);

    if (!market || !side) {
      return NextResponse.json({ error: "Invalid paper order" }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
    }

    const db = prisma as PrismaWithPaperTrading;
    const account = await db.paperAccount.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        virtualBalance: DEFAULT_PAPER_BALANCE,
        virtualPnl: 0,
      },
    });
    const marketPrice = await getMarketPrice(market);

    if (!marketPrice || marketPrice <= 0) {
      await db.tradeLog.create({
        data: {
          userId,
          mode: "PAPER",
          market,
          side: "ERROR",
          signal: "ERROR",
          probability: Number.isFinite(probability) ? probability : null,
          price: null,
        },
      });

      return NextResponse.json({ error: "Market price unavailable" }, { status: 500 });
    }

    if (side === "BUY") {
      if (account.virtualBalance < amount) {
        return NextResponse.json({ error: "Insufficient paper balance" }, { status: 400 });
      }

      const qty = amount / marketPrice;
      const existingPosition = await prisma.paperPosition.findFirst({
        where: { userId, exchange, symbol: market },
      });

      if (existingPosition) {
        const totalQty = existingPosition.qty + qty;
        const totalInvested = existingPosition.invested + amount;

        await prisma.paperPosition.update({
          where: { id: existingPosition.id },
          data: {
            qty: totalQty,
            invested: totalInvested,
            avgPrice: totalInvested / totalQty,
          },
        });
      } else {
        await prisma.paperPosition.create({
          data: {
            userId,
            exchange,
            symbol: market,
            qty,
            invested: amount,
            avgPrice: marketPrice,
          },
        });
      }

      await db.paperAccount.update({
        where: { userId },
        data: {
          virtualBalance: account.virtualBalance - amount,
        },
      });

      const order = await prisma.paperOrder.create({
        data: {
          userId,
          exchange,
          symbol: market,
          side,
          type: "MARKET",
          status: "FILLED",
          price: marketPrice,
          qty,
          amount,
        },
      });

      await prisma.paperTrade.create({
        data: {
          userId,
          orderId: order.id,
          exchange,
          symbol: market,
          side,
          price: marketPrice,
          qty,
          value: amount,
        },
      });

      await db.tradeLog.create({
        data: {
          userId,
          mode: "PAPER",
          market,
          side: "BUY",
          signal: "BUY",
          probability: Number.isFinite(probability) ? probability : null,
          price: marketPrice,
          entryPrice: marketPrice,
        },
      });

      return NextResponse.json({
        success: true,
        mode: "PAPER",
        side: "BUY",
        market,
        price: marketPrice,
        qty,
        amount,
      });
    }

    const position = await prisma.paperPosition.findFirst({
      where: { userId, exchange, symbol: market },
    });

    if (!position) {
      return NextResponse.json({ error: "No paper position" }, { status: 400 });
    }

    const sellQty = Math.min(amount / marketPrice, position.qty);
    const remainQty = position.qty - sellQty;
    const sellValue = sellQty * marketPrice;
    const pnl = sellValue - position.avgPrice * sellQty;

    if (remainQty <= 0.0000001) {
      await prisma.paperPosition.delete({ where: { id: position.id } });
    } else {
      await prisma.paperPosition.update({
        where: { id: position.id },
        data: {
          qty: remainQty,
          invested: position.avgPrice * remainQty,
        },
      });
    }

    const nextBalance = account.virtualBalance + sellValue;
    const nextPnl = account.virtualPnl + pnl;

    await db.paperAccount.update({
      where: { userId },
      data: {
        virtualBalance: nextBalance,
        virtualPnl: nextPnl,
      },
    });

    const order = await prisma.paperOrder.create({
      data: {
        userId,
        exchange,
        symbol: market,
        side,
        type: "MARKET",
        status: "FILLED",
        price: marketPrice,
        qty: sellQty,
        amount: sellValue,
      },
    });

    await prisma.paperTrade.create({
      data: {
        userId,
        orderId: order.id,
        exchange,
        symbol: market,
        side,
        price: marketPrice,
        qty: sellQty,
        value: sellValue,
        pnl,
      },
    });

    await db.tradeLog.create({
      data: {
        userId,
        mode: "PAPER",
        market,
        side: "SELL",
        signal: "SELL",
        probability: Number.isFinite(probability) ? probability : null,
        price: marketPrice,
        exitPrice: marketPrice,
        pnl,
      },
    });

    return NextResponse.json({
      success: true,
      mode: "PAPER",
      side: "SELL",
      market,
      price: marketPrice,
      qty: sellQty,
      amount: sellValue,
      pnl,
      pnlRate: position.avgPrice > 0 ? (pnl / (position.avgPrice * sellQty)) * 100 : 0,
    });
  } catch (err) {
    console.error("PAPER_ORDER_POST_ERROR:", err);
    return NextResponse.json({ error: "Paper order failed" }, { status: 500 });
  }
}
