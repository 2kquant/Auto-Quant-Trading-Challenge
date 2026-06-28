import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId, isTelegramAdmin } from "@/lib/auth/request-user";

type TradeLogInput = {
  mode?: string;
  market?: string;
  side?: string;
  signal?: string;
  probability?: number;
  price?: number;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  telegramChatId?: string;
};

type TradeLogDelegate = {
  create: (args: {
    data: {
      userId: string;
      mode: string;
      market: string;
      side: string;
      signal?: string | null;
      probability?: number | null;
      price?: number | null;
      entryPrice?: number | null;
      exitPrice?: number | null;
      pnl?: number | null;
    };
  }) => Promise<unknown>;
  findMany: (args: {
    where: { userId: string };
    orderBy: { createdAt: "desc" };
    take: number;
  }) => Promise<unknown[]>;
};

type TelegramUserLinkDelegate = {
  findUnique: (args: {
    where: { telegramChatId: string };
    select: { userId: boolean };
  }) => Promise<{ userId: string } | null>;
};

type PrismaWithTradeLogs = typeof prisma & {
  tradeLog: TradeLogDelegate;
  telegramUserLink: TelegramUserLinkDelegate;
};

function normalizeMode(value: unknown) {
  const mode = String(value || "PAPER").toUpperCase();
  return mode === "LIVE" ? "LIVE" : "PAPER";
}

function normalizeSide(value: unknown) {
  const side = String(value || "").toUpperCase();
  if (side === "BUY" || side === "SELL" || side === "HOLD" || side === "ERROR") {
    return side;
  }
  return null;
}

function nullableNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function getUserId(req: NextRequest, body?: TradeLogInput) {
  const webUserId = getRequestUserId(req);
  if (webUserId) return webUserId;

  if (!isTelegramAdmin(req)) return null;

  const chatId =
    body?.telegramChatId || req.nextUrl.searchParams.get("telegramChatId") || "";

  if (!chatId.trim()) return null;

  const db = prisma as PrismaWithTradeLogs;
  const link = await db.telegramUserLink.findUnique({
    where: { telegramChatId: chatId.trim() },
    select: { userId: true },
  });

  return link?.userId || null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit") || 50), 1),
      100,
    );
    const db = prisma as PrismaWithTradeLogs;
    const logs = await db.tradeLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trade logs failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as TradeLogInput;
    const userId = await getUserId(req, body);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const side = normalizeSide(body.side || body.signal);

    if (!side) {
      return NextResponse.json({ error: "Invalid log side" }, { status: 400 });
    }

    const market = String(body.market || "BTC").toUpperCase();
    const db = prisma as PrismaWithTradeLogs;
    const log = await db.tradeLog.create({
      data: {
        userId,
        mode: normalizeMode(body.mode),
        market,
        side,
        signal: body.signal ? String(body.signal).toUpperCase() : side,
        probability: nullableNumber(body.probability),
        price: nullableNumber(body.price),
        entryPrice: nullableNumber(body.entryPrice),
        exitPrice: nullableNumber(body.exitPrice),
        pnl: nullableNumber(body.pnl),
      },
    });

    return NextResponse.json({ log });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trade log failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
