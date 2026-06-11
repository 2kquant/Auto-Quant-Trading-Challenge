import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

type JwtPayload = {
  id?: string;
  userId?: string;
  email?: string;
};

function getUserId(req: NextRequest) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cookieToken = req.cookies.get("token")?.value;
  const token = authToken || cookieToken;

  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

  return decoded.id || decoded.userId || null;
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const wallet = await prisma.paperWallet.findUnique({
      where: { userId },
    });

    return NextResponse.json({
      wallet,
    });
  } catch (err) {
    console.error("PAPER_WALLET_GET_ERROR:", err);

    return NextResponse.json({ error: "가상 지갑 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const cash = Number(body.cash || 10000);
    const currency = String(body.currency || "USDT").toUpperCase();

    if (!Number.isFinite(cash) || cash <= 0) {
      return NextResponse.json(
        { error: "cash 값이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const wallet = await prisma.paperWallet.upsert({
      where: { userId },
      update: {
        cash,
        currency,
      },
      create: {
        userId,
        cash,
        currency,
      },
    });

    return NextResponse.json({
      message: "가상머니 발급 완료",
      wallet,
    });
  } catch (err) {
    console.error("PAPER_WALLET_POST_ERROR:", err);

    return NextResponse.json({ error: "가상머니 발급 실패" }, { status: 500 });
  }
}
