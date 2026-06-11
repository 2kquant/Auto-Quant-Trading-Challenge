from __future__ import annotations

import numpy as np
import pandas as pd

from .backtest_log import BacktestLogger
from .model_judgement import ConfidenceTracker, ModelJudgementLogger
from .monitoring import EntryCandidateRanker, RealtimeFeatureMonitor
from .risk_profile import RiskProfileConfig


def build_dummy_market_frame() -> pd.DataFrame:
    np.random.seed(2026)
    markets = ["KRW-BTC", "KRW-ETH", "KRW-XRP", "KRW-ADA"]
    rows = []
    base_time = pd.Timestamp.utcnow().floor("1min")

    for market in markets:
        prices = 100 * np.exp(np.cumsum(np.random.randn(120) * 0.002))
        volume = np.random.uniform(200, 2000, len(prices))

        for idx, price in enumerate(prices):
            rows.append(
                {
                    "market": market,
                    "timestamp_utc": base_time + pd.Timedelta(minutes=idx),
                    "close_u": float(price),
                    "volume_rel_30": float(volume[idx]),
                    "volatility_30m": float(np.abs(np.random.randn()) * 0.01),
                    "trend_probability": float(np.clip(np.random.normal(0.65, 0.15), 0.0, 1.0)),
                }
            )

    df = pd.DataFrame(rows)
    df["signal"] = (df["trend_probability"] >= 0.6).astype(int)
    df["future_return_30m"] = df.groupby("market")["close_u"].shift(-30) / df["close_u"] - 1
    return df


def run_demo() -> None:
    frame = build_dummy_market_frame()
    frame = frame.sort_values(["market", "timestamp_utc"]).reset_index(drop=True)

    monitor = RealtimeFeatureMonitor()
    latest = monitor.latest_snapshot(frame)
    print("=== 실시간 피처 최신 스냅샷 ===")
    print(latest[["market", "timestamp_utc", "close_u", "trend_probability", "signal"]])
    print()

    ranker = EntryCandidateRanker(top_n=5)
    candidates = ranker.rank_candidates(latest)
    print("=== 진입 후보 TOP N 랭킹 ===")
    print(candidates[["market", "trend_probability", "entry_score"]])
    print()

    risk_config = RiskProfileConfig.from_profile("neutral")
    judgement_logger = ModelJudgementLogger(risk_profile=risk_config.profile.value)
    tracker = ConfidenceTracker()

    for _, row in candidates.iterrows():
        decision = judgement_logger.log_prediction(
            market=row["market"],
            timestamp=row["timestamp_utc"],
            probability=row["trend_probability"],
            threshold=0.6,
            features={
                "close_u": float(row["close_u"]),
                "volatility_30m": float(row.get("volatility_30m", 0.0)),
            },
        )
        hit = float(row.get("future_return_30m", 0.0)) > 0
        tracker.update(decision.probability, hit)

    print("=== 모델 판단 로그 ===")
    print(judgement_logger.to_frame()[["market", "timestamp", "signal", "probability", "reason"]])
    print()

    print("=== 모델 신뢰도 및 적중률 요약 ===")
    print(tracker.summary())
    print()

    backtest_logger = BacktestLogger(fee_bps=5.0)
    backtest_log = backtest_logger.simulate_entries(candidates)
    print("=== 가상 진입 결과 백테스트 로그 ===")
    print(backtest_log[["market", "entry_time", "exit_time", "signal_probability", "realized_return"]])
    print()
    print("=== 백테스트 요약 ===")
    print(backtest_logger.summary())


if __name__ == "__main__":
    run_demo()
