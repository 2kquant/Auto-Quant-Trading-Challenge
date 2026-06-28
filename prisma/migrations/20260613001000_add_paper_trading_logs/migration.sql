-- CreateTable
CREATE TABLE "trading_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PAPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trading_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "virtualBalance" DOUBLE PRECISION NOT NULL DEFAULT 10000000,
    "virtualPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "signal" TEXT,
    "probability" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "entryPrice" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_decision_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "rsi" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "trendProbability" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "finalDecision" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PAPER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trading_preferences_userId_key" ON "trading_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "paper_accounts_userId_key" ON "paper_accounts"("userId");

-- CreateIndex
CREATE INDEX "trade_logs_userId_createdAt_idx" ON "trade_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_decision_logs_userId_createdAt_idx" ON "ai_decision_logs"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "trading_preferences" ADD CONSTRAINT "trading_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_accounts" ADD CONSTRAINT "paper_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_logs" ADD CONSTRAINT "trade_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_decision_logs" ADD CONSTRAINT "ai_decision_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
