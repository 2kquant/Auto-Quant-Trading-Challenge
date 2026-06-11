import { NextRequest, NextResponse } from "next/server";
import { createPublicExchange, ExchangeName } from "@/lib/exchange/ccxt";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const exchange = (searchParams.get("exchange") ||
      "binance") as ExchangeName;

    const symbol = searchParams.get("symbol") || "BTC/USDT";

    const timeframe = searchParams.get("timeframe") || "1m";

    const limit = Number(searchParams.get("limit") || 300);

    const ex = createPublicExchange(exchange);

    const candles = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);

    return NextResponse.json({
      success: true,
      exchange,
      symbol,
      timeframe,
      candles: candles.map((c) => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      })),
    });
  } catch (err: any) {
    console.error("OHLCV_ERROR:", err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 },
    );
  }
}
