import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId, isTelegramAdmin } from "@/lib/auth/request-user";

type TradingMode = "PAPER" | "LIVE";

type TradingPreferenceDelegate = {
  upsert: (args: {
    where: { userId: string };
    update: { mode: TradingMode };
    create: { userId: string; mode: TradingMode };
  }) => Promise<{ mode: string; updatedAt: Date }>;
  findUnique: (args: {
    where: { userId: string };
  }) => Promise<{ mode: string; updatedAt: Date } | null>;
};

type TelegramUserLinkDelegate = {
  findUnique: (args: {
    where: { telegramChatId: string };
    select: { userId: boolean };
  }) => Promise<{ userId: string } | null>;
};

type PrismaWithTradingMode = typeof prisma & {
  tradingPreference: TradingPreferenceDelegate;
  telegramUserLink: TelegramUserLinkDelegate;
};

function normalizeMode(value: unknown): TradingMode | null {
  const mode = String(value || "").toUpperCase();
  return mode === "PAPER" || mode === "LIVE" ? mode : null;
}

async function getUserId(req: NextRequest, body?: { telegramChatId?: string }) {
  const webUserId = getRequestUserId(req);
  if (webUserId) return webUserId;

  if (!isTelegramAdmin(req)) return null;

  const chatId =
    body?.telegramChatId || req.nextUrl.searchParams.get("telegramChatId") || "";

  if (!chatId.trim()) return null;

  const db = prisma as PrismaWithTradingMode;
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

    const db = prisma as PrismaWithTradingMode;
    const preference = await db.tradingPreference.findUnique({
      where: { userId },
    });

    return NextResponse.json({
      mode: normalizeMode(preference?.mode) || "PAPER",
      updatedAt: preference?.updatedAt || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trading mode failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      telegramChatId?: string;
    };
    const mode = normalizeMode(body.mode);

    if (!mode) {
      return NextResponse.json({ error: "Invalid trading mode" }, { status: 400 });
    }

    const userId = await getUserId(req, body);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = prisma as PrismaWithTradingMode;
    const preference = await db.tradingPreference.upsert({
      where: { userId },
      update: { mode },
      create: { userId, mode },
    });

    return NextResponse.json({
      mode: preference.mode,
      updatedAt: preference.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trading mode failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
