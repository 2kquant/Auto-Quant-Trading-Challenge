import { NextRequest, NextResponse } from "next/server";
import { createPublicExchange, ExchangeName } from "@/lib/exchange/ccxt";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const exchange = (searchParams.get("exchange") ||
      "binance") as ExchangeName;

    const symbol = searchParams.get("symbol") || "BTC/USDT";

    const ex = createPublicExchange(exchange);

    const ticker = await ex.fetchTicker(symbol);

    return NextResponse.json({
      success: true,
      exchange,
      symbol,
      last: ticker.last,
      bid: ticker.bid,
      ask: ticker.ask,
      high: ticker.high,
      low: ticker.low,
      percentage: ticker.percentage,
      volume: ticker.baseVolume,
    });
  } catch (err: any) {
    console.error("TICKER_ERROR:", err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 },
    );
  }
}
