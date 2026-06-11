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

async function getMarketPrice(symbol: string) {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    {
      cache: "no-store",
    },
  );

  const data = await res.json();

  return Number(data.price || 0);
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await req.json();

    const exchange = String(body.exchange || "binance").toLowerCase();
    const symbol = String(body.symbol || "").toUpperCase();
    const side = String(body.side || "").toUpperCase();
    const amount = Number(body.amount || 0);

    if (!symbol || !["BUY", "SELL"].includes(side)) {
      return NextResponse.json({ error: "잘못된 주문 요청" }, { status: 400 });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount 값 오류" }, { status: 400 });
    }

    const wallet = await prisma.paperWallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "가상 지갑이 없습니다." },
        { status: 400 },
      );
    }

    const marketPrice = await getMarketPrice(symbol);

    if (!marketPrice || marketPrice <= 0) {
      return NextResponse.json({ error: "현재가 조회 실패" }, { status: 500 });
    }

    // BUY
    if (side === "BUY") {
      if (wallet.cash < amount) {
        return NextResponse.json({ error: "잔액 부족" }, { status: 400 });
      }

      const qty = amount / marketPrice;

      const existingPosition = await prisma.paperPosition.findFirst({
        where: {
          userId,
          exchange,
          symbol,
        },
      });

      if (existingPosition) {
        const totalQty = existingPosition.qty + qty;

        const totalInvested = existingPosition.invested + amount;

        const avgPrice = totalInvested / totalQty;

        await prisma.paperPosition.update({
          where: {
            id: existingPosition.id,
          },
          data: {
            qty: totalQty,
            invested: totalInvested,
            avgPrice,
          },
        });
      } else {
        await prisma.paperPosition.create({
          data: {
            userId,
            exchange,
            symbol,
            qty,
            invested: amount,
            avgPrice: marketPrice,
          },
        });
      }

      await prisma.paperWallet.update({
        where: { userId },
        data: {
          cash: wallet.cash - amount,
        },
      });

      const order = await prisma.paperOrder.create({
        data: {
          userId,
          exchange,
          symbol,
          side,
          type: "MARKET",
          status: "FILLED",
          price: marketPrice,
          qty,
          amount,
        },
      });

      await prisma.paperTrade.create({
        data: {
          userId,
          orderId: order.id,
          exchange,
          symbol,
          side,
          price: marketPrice,
          qty,
          value: amount,
        },
      });

      return NextResponse.json({
        success: true,
        message: "매수 완료",
      });
    }

    // SELL
    const position = await prisma.paperPosition.findFirst({
      where: {
        userId,
        exchange,
        symbol,
      },
    });

    if (!position) {
      return NextResponse.json({ error: "포지션 없음" }, { status: 400 });
    }

    const sellQty = amount / marketPrice;

    if (sellQty > position.qty) {
      return NextResponse.json({ error: "보유 수량 부족" }, { status: 400 });
    }

    const remainQty = position.qty - sellQty;

    const sellValue = sellQty * marketPrice;

    const pnl = sellValue - position.avgPrice * sellQty;

    if (remainQty <= 0.0000001) {
      await prisma.paperPosition.delete({
        where: {
          id: position.id,
        },
      });
    } else {
      await prisma.paperPosition.update({
        where: {
          id: position.id,
        },
        data: {
          qty: remainQty,
          invested: position.avgPrice * remainQty,
        },
      });
    }

    await prisma.paperWallet.update({
      where: { userId },
      data: {
        cash: wallet.cash + sellValue,
      },
    });

    const order = await prisma.paperOrder.create({
      data: {
        userId,
        exchange,
        symbol,
        side,
        type: "MARKET",
        status: "FILLED",
        price: marketPrice,
        qty: sellQty,
        amount: sellValue,
      },
    });

    await prisma.paperTrade.create({
      data: {
        userId,
        orderId: order.id,
        exchange,
        symbol,
        side,
        price: marketPrice,
        qty: sellQty,
        value: sellValue,
        pnl,
      },
    });

    return NextResponse.json({
      success: true,
      message: "매도 완료",
      pnl,
    });
  } catch (err) {
    console.error("PAPER_ORDER_POST_ERROR:", err);

    return NextResponse.json({ error: "가상 주문 실패" }, { status: 500 });
  }
}
