import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId, isTelegramAdmin } from "@/lib/auth/request-user";

type AiLogInput = {
  market?: string;
  rsi?: number;
  volume?: number;
  trendProbability?: number;
  confidence?: number;
  finalDecision?: string;
  mode?: string;
  telegramChatId?: string;
};

type AiDecisionLogDelegate = {
  create: (args: {
    data: {
      userId: string;
      market: string;
      rsi?: number | null;
      volume?: number | null;
      trendProbability?: number | null;
      confidence?: number | null;
      finalDecision: string;
      mode: string;
    };
  }) => Promise<unknown>;
  createMany: (args: {
    data: Array<{
      userId: string;
      market: string;
      rsi?: number | null;
      volume?: number | null;
      trendProbability?: number | null;
      confidence?: number | null;
      finalDecision: string;
      mode: string;
    }>;
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

type PrismaWithAiLogs = typeof prisma & {
  aiDecisionLog: AiDecisionLogDelegate;
  telegramUserLink: TelegramUserLinkDelegate;
};

function normalizeMode(value: unknown) {
  const mode = String(value || "PAPER").toUpperCase();
  return mode === "LIVE" ? "LIVE" : "PAPER";
}

function nullableNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function getUserId(req: NextRequest, body?: AiLogInput) {
  const webUserId = getRequestUserId(req);
  if (webUserId) return webUserId;

  if (!isTelegramAdmin(req)) return null;

  const chatId =
    body?.telegramChatId ||
    req.nextUrl.searchParams.get("telegramChatId") ||
    "";

  if (!chatId.trim()) return null;

  const db = prisma as PrismaWithAiLogs;
  const link = await db.telegramUserLink.findUnique({
    where: { telegramChatId: chatId.trim() },
    select: { userId: true },
  });

  return link?.userId || null;
}

function toLogData(userId: string, input: AiLogInput) {
  const trendProbability = nullableNumber(input.trendProbability);
  const confidence = nullableNumber(input.confidence);
  const finalDecision =
    input.finalDecision ||
    (trendProbability !== null &&
    confidence !== null &&
    trendProbability >= confidence
      ? "BUY"
      : "HOLD");

  return {
    userId,
    market: String(input.market || "BTC").toUpperCase(),
    rsi: nullableNumber(input.rsi),
    volume: nullableNumber(input.volume),
    trendProbability,
    confidence,
    finalDecision: String(finalDecision).toUpperCase(),
    mode: normalizeMode(input.mode),
  };
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
    const db = prisma as PrismaWithAiLogs;
    const logs = await db.aiDecisionLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI logs failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as
      | AiLogInput
      | { logs?: AiLogInput[] };

    const hasLogsArray =
      typeof body === "object" &&
      body !== null &&
      "logs" in body &&
      Array.isArray(body.logs);

    const logs: AiLogInput[] = hasLogsArray ? (body.logs ?? []) : [];

    const firstLog: AiLogInput | undefined = hasLogsArray
      ? logs[0]
      : (body as AiLogInput);

    const userId = await getUserId(req, firstLog);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = prisma as PrismaWithAiLogs;

    if (hasLogsArray) {
      const data = logs.slice(0, 100).map((item) => toLogData(userId, item));

      const result = await db.aiDecisionLog.createMany({
        data,
      });

      return NextResponse.json({ result });
    }

    const log = await db.aiDecisionLog.create({
      data: toLogData(userId, body as AiLogInput),
    });

    return NextResponse.json({ log });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI log failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
