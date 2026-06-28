import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type TelegramUserLinkDelegate = {
  findUnique: (args: {
    where: { telegramChatId: string };
    select: {
      telegramChatId: boolean;
      userId: boolean;
      user: { select: { email: boolean } };
    };
  }) => Promise<{
    telegramChatId: string;
    userId: string;
    user: { email: string };
  } | null>;
};

type PrismaWithTelegram = typeof prisma & {
  telegramUserLink: TelegramUserLinkDelegate;
};

function isTelegramAdmin(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_ADMIN_SECRET;
  const providedSecret = req.headers.get("x-telegram-admin-secret");

  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
}

export async function GET(req: NextRequest) {
  try {
    if (!isTelegramAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const chatId = req.nextUrl.searchParams.get("chatId")?.trim();

    if (!chatId) {
      return NextResponse.json({ linked: false });
    }

    const db = prisma as PrismaWithTelegram;
    const link = await db.telegramUserLink.findUnique({
      where: { telegramChatId: chatId },
      select: {
        telegramChatId: true,
        userId: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!link) {
      return NextResponse.json({ linked: false });
    }

    return NextResponse.json({
      linked: true,
      telegramChatId: link.telegramChatId,
      userId: link.userId,
      email: link.user.email,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Telegram auth failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
