import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

type JwtPayload = {
  id?: string;
  userId?: string;
  email?: string;
};

type TelegramUserLinkDelegate = {
  upsert: (args: {
    where: { telegramChatId: string };
    update: { userId: string };
    create: { telegramChatId: string; userId: string };
  }) => Promise<{ id: string; telegramChatId: string; userId: string }>;
};

type PrismaWithTelegram = typeof prisma & {
  telegramUserLink: TelegramUserLinkDelegate;
};

function getUserId(req: NextRequest) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cookieToken = req.cookies.get("token")?.value;
  const token = authToken || cookieToken;

  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

  return decoded.id || decoded.userId || null;
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { telegramChatId?: string };
    const telegramChatId = String(body.telegramChatId || "").trim();

    if (!telegramChatId) {
      return NextResponse.json(
        { error: "Telegram Chat ID is required" },
        { status: 400 },
      );
    }

    const db = prisma as PrismaWithTelegram;
    const link = await db.telegramUserLink.upsert({
      where: { telegramChatId },
      update: { userId },
      create: {
        telegramChatId,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      telegramChatId: link.telegramChatId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Telegram link failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
