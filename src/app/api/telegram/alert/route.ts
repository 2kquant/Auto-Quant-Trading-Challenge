import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

type AlertType = "BUY" | "SELL" | "ERROR";

type JwtPayload = {
  id?: string;
  userId?: string;
  email?: string;
};

type TelegramAlertBody = {
  type?: string;
  market?: string;
  price?: number;
  exitPrice?: number;
  probability?: number;
  pnl?: number;
  message?: string;
};

function getUserId(req: NextRequest) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cookieToken = req.cookies.get("token")?.value;
  const token = authToken || cookieToken;

  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

  return decoded.id || decoded.userId || null;
}

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function formatPrice(value: unknown) {
  const numberValue = toNumber(value);

  return numberValue >= 100
    ? Math.round(numberValue).toLocaleString("ko-KR")
    : numberValue.toLocaleString("ko-KR", {
        maximumFractionDigits: 4,
      });
}

function formatProbability(value: unknown) {
  let numberValue = toNumber(value);

  if (numberValue >= 0 && numberValue <= 1) {
    numberValue *= 100;
  }

  return `${numberValue.toFixed(2)}%`;
}

function formatPnl(value: unknown) {
  const numberValue = toNumber(value);
  return `${numberValue >= 0 ? "+" : ""}${numberValue.toFixed(2)}%`;
}

function normalizeType(value: string | undefined): AlertType | null {
  const type = String(value || "").toUpperCase();

  if (type === "BUY" || type === "SELL" || type === "ERROR") {
    return type;
  }

  return null;
}

function buildMessage(type: AlertType, body: TelegramAlertBody) {
  if (type === "BUY") {
    return [
      "🟢 BUY",
      `Market: ${body.market || "-"}`,
      `Price: ${formatPrice(body.price)}`,
      `Probability: ${formatProbability(body.probability)}`,
    ].join("\n");
  }

  if (type === "SELL") {
    return [
      "🔴 SELL",
      `Market: ${body.market || "-"}`,
      `Exit Price: ${formatPrice(body.exitPrice ?? body.price)}`,
      `PnL: ${formatPnl(body.pnl)}`,
    ].join("\n");
  }

  return ["⚠ ERROR", body.message || "Unknown error"].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required" },
        { status: 400 },
      );
    }

    const body = (await req.json()) as TelegramAlertBody;
    const type = normalizeType(body.type);

    if (!type) {
      return NextResponse.json(
        { error: "Invalid alert type" },
        { status: 400 },
      );
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildMessage(type, body),
        }),
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Telegram send failed" },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Telegram alert failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
