import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestUserId, isTelegramAdmin } from "@/lib/auth/request-user";

const DEFAULT_PAPER_BALANCE = 10_000_000;

type PaperAccountDelegate = {
  upsert: (args: {
    where: { userId: string };
    update: { virtualBalance?: number; virtualPnl?: number };
    create: { userId: string; virtualBalance: number; virtualPnl?: number };
  }) => Promise<{
    userId: string;
    virtualBalance: number;
    virtualPnl: number;
    updatedAt: Date;
  }>;
  findUnique: (args: {
    where: { userId: string };
  }) => Promise<{
    userId: string;
    virtualBalance: number;
    virtualPnl: number;
    updatedAt: Date;
  } | null>;
};

type PrismaWithPaperAccount = typeof prisma & {
  paperAccount: PaperAccountDelegate;
  telegramUserLink: {
    findUnique: (args: {
      where: { telegramChatId: string };
      select: { userId: boolean };
    }) => Promise<{ userId: string } | null>;
  };
};

async function getUserId(req: NextRequest) {
  const webUserId = getRequestUserId(req);
  if (webUserId) return webUserId;

  if (!isTelegramAdmin(req)) return null;

  const chatId = req.nextUrl.searchParams.get("telegramChatId")?.trim();

  if (!chatId) return null;

  const db = prisma as PrismaWithPaperAccount;
  const link = await db.telegramUserLink.findUnique({
    where: { telegramChatId: chatId },
    select: { userId: true },
  });

  return link?.userId || null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const db = prisma as PrismaWithPaperAccount;
    const account = await db.paperAccount.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        virtualBalance: DEFAULT_PAPER_BALANCE,
        virtualPnl: 0,
      },
    });

    return NextResponse.json({
      account,
      wallet: {
        cash: account.virtualBalance,
        currency: "KRW",
      },
    });
  } catch (err) {
    console.error("PAPER_WALLET_GET_ERROR:", err);
    return NextResponse.json({ error: "Paper account failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      virtualBalance?: number;
      cash?: number;
    };
    const virtualBalance = Number(
      body.virtualBalance ?? body.cash ?? DEFAULT_PAPER_BALANCE,
    );

    if (!Number.isFinite(virtualBalance) || virtualBalance <= 0) {
      return NextResponse.json(
        { error: "virtualBalance must be greater than 0" },
        { status: 400 },
      );
    }

    const db = prisma as PrismaWithPaperAccount;
    const account = await db.paperAccount.upsert({
      where: { userId },
      update: {
        virtualBalance,
        virtualPnl: 0,
      },
      create: {
        userId,
        virtualBalance,
        virtualPnl: 0,
      },
    });

    return NextResponse.json({
      message: "Paper account ready",
      account,
      wallet: {
        cash: account.virtualBalance,
        currency: "KRW",
      },
    });
  } catch (err) {
    console.error("PAPER_WALLET_POST_ERROR:", err);
    return NextResponse.json({ error: "Paper account failed" }, { status: 500 });
  }
}
