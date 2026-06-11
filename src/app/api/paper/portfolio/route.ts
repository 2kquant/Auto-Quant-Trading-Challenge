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

    const positions = await prisma.paperPosition.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const trades = await prisma.paperTrade.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return NextResponse.json({
      wallet,
      positions,
      trades,
    });
  } catch (err) {
    console.error("PAPER_PORTFOLIO_GET_ERROR:", err);

    return NextResponse.json(
      { error: "가상 포트폴리오 조회 실패" },
      { status: 500 },
    );
  }
}
