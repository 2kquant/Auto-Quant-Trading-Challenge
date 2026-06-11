import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { createPrivateExchange } from "@/lib/exchange/ccxt";

type JwtPayload = {
  id?: string;
  userId?: string;
  email: string;
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
      return NextResponse.json([]);
    }

    const keys = await prisma.exchangeApiKey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (keys.length === 0) {
      return NextResponse.json([]);
    }

    const result = [];

    for (const item of keys) {
      try {
        const exchange = createPrivateExchange(
          item.exchange as any,
          item.apiKey,
          item.secretKey,
        );

        const balance = await exchange.fetchBalance();

        result.push({
          exchange: item.exchange,
          balance,
          error: false,
        });
      } catch (err: any) {
        result.push({
          exchange: item.exchange,
          balance: null,
          error: true,
          message: err?.message || "잔고 조회 실패",
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("BALANCE_GET_ERROR:", err);
    return NextResponse.json([]);
  }
}
