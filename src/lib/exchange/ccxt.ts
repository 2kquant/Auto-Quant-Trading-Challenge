import ccxt from "ccxt";

export type ExchangeName = "upbit" | "binance";

export function createPrivateExchange(
  exchange: ExchangeName,
  apiKey: string,
  secretKey: string,
) {
  if (exchange === "upbit") {
    return new ccxt.upbit({
      apiKey,
      secret: secretKey,
      enableRateLimit: true,
    });
  }

  return new ccxt.binance({
    apiKey,
    secret: secretKey,
    enableRateLimit: true,
    options: {
      defaultType: "spot",
    },
  });
}

export function createPublicExchange(exchange: ExchangeName) {
  if (exchange === "upbit") {
    return new ccxt.upbit({
      enableRateLimit: true,
    });
  }

  return new ccxt.binance({
    enableRateLimit: true,
    options: {
      defaultType: "spot",
    },
  });
}
