import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

type JwtPayload = {
  id?: string;
  userId?: string;
  email?: string;
};

export async function POST(req: NextRequest) {
  try {
    const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
    const cookieToken = req.cookies.get("token")?.value;
    const token = authToken || cookieToken;

    if (!token) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    const userId = decoded.id || decoded.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "토큰에서 userId를 찾을 수 없습니다." },
        { status: 401 },
      );
    }

    const body = await req.json();

    const exchange = String(body.exchange || "")
      .toLowerCase()
      .trim();
    const apiKey = String(body.apiKey || "").trim();
    const secretKey = String(body.secretKey || "").trim();

    if (!exchange || !apiKey || !secretKey) {
      return NextResponse.json({ error: "모든 값 필요" }, { status: 400 });
    }

    const saved = await prisma.exchangeApiKey.upsert({
      where: {
        userId_exchange: {
          userId,
          exchange,
        },
      },
      update: {
        apiKey,
        secretKey,
      },
      create: {
        userId,
        exchange,
        apiKey,
        secretKey,
      },
    });

    return NextResponse.json({
      id: saved.id,
      userId: saved.userId,
      exchange: saved.exchange,
      apiKey: saved.apiKey,
      secretKey: saved.secretKey,
      createdAt: saved.createdAt,
    });
  } catch (err: any) {
    console.error("SAVE_KEY_ERROR:", err);

    return NextResponse.json(
      {
        error: err?.message || "서버 에러",
        detail: String(err),
      },
      { status: 500 },
    );
  }
}
