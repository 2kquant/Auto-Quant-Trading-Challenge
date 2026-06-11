from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class ModelDecision:
    market: str
    timestamp: pd.Timestamp
    signal: int
    probability: float
    threshold: float
    reason: str
    confidence: float
    risk_profile: str
    features: dict[str, float] = field(default_factory=dict)


class ModelJudgementLogger:
    def __init__(self, risk_profile: str = "neutral") -> None:
        self.risk_profile = risk_profile
        self.records: list[ModelDecision] = []

    def make_reason(self, probability: float, threshold: float, signal: int) -> str:
        if signal == 1:
            return f"매수: 확률 {probability:.2%} ≥ 임계값 {threshold:.2%}"

        if probability >= threshold * 0.9:
            return f"대기: 확률 {probability:.2%}이지만 추세 확정 전"

        if probability >= threshold * 0.7:
            return f"대기: 신뢰도 약간 낮음 ({probability:.2%})"

        return f"대기: 시장 변동성 또는 약세 신호 ({probability:.2%})"

    def log_prediction(
        self,
        market: str,
        timestamp: Any,
        probability: float,
        threshold: float,
        features: dict[str, float] | None = None,
        signal: int | None = None,
    ) -> ModelDecision:
        ts = pd.to_datetime(timestamp)
        signal_value = int((probability >= threshold) if signal is None else signal)
        reason = self.make_reason(probability, threshold, signal_value)
        confidence = float(np.clip(probability, 0.0, 1.0))

        record = ModelDecision(
            market=market,
            timestamp=ts,
            signal=signal_value,
            probability=confidence,
            threshold=float(threshold),
            reason=reason,
            confidence=confidence,
            risk_profile=self.risk_profile,
            features=features or {},
        )
        self.records.append(record)
        return record

    def to_frame(self) -> pd.DataFrame:
        if not self.records:
            return pd.DataFrame()

        rows = []
        for record in self.records:
            row = {
                "market": record.market,
                "timestamp": record.timestamp,
                "signal": record.signal,
                "probability": record.probability,
                "threshold": record.threshold,
                "confidence": record.confidence,
                "reason": record.reason,
                "risk_profile": record.risk_profile,
            }
            row.update({f"feature_{k}": v for k, v in record.features.items()})
            rows.append(row)

        return pd.DataFrame(rows)


@dataclass
class ConfidenceTracker:
    history: list[dict[str, Any]] = field(default_factory=list)

    def update(self, probability: float, is_hit: bool) -> None:
        self.history.append({"probability": float(probability), "hit": bool(is_hit)})

    def summary(self) -> dict[str, float]:
        if not self.history:
            return {
                "count": 0,
                "average_probability": 0.0,
                "hit_rate": 0.0,
                "average_hit_probability": 0.0,
                "average_miss_probability": 0.0,
            }

        df = pd.DataFrame(self.history)
        hits = df[df["hit"]]
        misses = df[~df["hit"]]
        return {
            "count": float(len(df)),
            "average_probability": float(df["probability"].mean()),
            "hit_rate": float(df["hit"].mean()),
            "average_hit_probability": float(hits["probability"].mean()) if not hits.empty else 0.0,
            "average_miss_probability": float(misses["probability"].mean()) if not misses.empty else 0.0,
        }
