from __future__ import annotations

import numpy as np
import pandas as pd


class RealtimeFeatureMonitor:
    def __init__(self, feature_columns: list[str] | None = None) -> None:
        self.feature_columns = feature_columns
        self.previous_snapshot: pd.DataFrame | None = None

    def latest_snapshot(self, frame: pd.DataFrame, grouped_by: str = "market") -> pd.DataFrame:
        if frame.empty or grouped_by not in frame.columns:
            return pd.DataFrame()

        return frame.sort_values("timestamp_utc").groupby(grouped_by, group_keys=False).tail(1).reset_index(drop=True)

    def feature_change_summary(self, current: pd.DataFrame, top_n: int = 10) -> pd.DataFrame:
        if self.previous_snapshot is None or current.empty:
            self.previous_snapshot = current.copy()
            return pd.DataFrame()

        common = set(current.columns) & set(self.previous_snapshot.columns)
        numeric = [c for c in common if pd.api.types.is_numeric_dtype(current[c]) and c not in ["timestamp_utc"]]
        diffs = []
        prior = self.previous_snapshot.set_index("market")

        for _, row in current.set_index("market").iterrows():
            if row.name not in prior.index:
                continue
            delta = row[numeric] - prior.loc[row.name, numeric]
            top_changes = delta.abs().sort_values(ascending=False).head(top_n)
            for feature_name, diff_value in top_changes.iteritems():
                diffs.append(
                    {
                        "market": row.name,
                        "feature": feature_name,
                        "delta": float(delta[feature_name]),
                        "current_value": float(row[feature_name]),
                    }
                )

        self.previous_snapshot = current.copy()
        return pd.DataFrame(diffs)

    def summary(self, frame: pd.DataFrame) -> dict[str, float]:
        if frame.empty:
            return {}

        out: dict[str, float] = {}
        if "trend_probability" in frame.columns:
            out["average_probability"] = float(frame["trend_probability"].mean())
            out["median_probability"] = float(frame["trend_probability"].median())
            out["max_probability"] = float(frame["trend_probability"].max())
            out["min_probability"] = float(frame["trend_probability"].min())
        if "signal" in frame.columns:
            out["buy_signal_rate"] = float((frame["signal"] == 1).mean())
        return out


class EntryCandidateRanker:
    def __init__(self, top_n: int = 10) -> None:
        self.top_n = top_n

    def rank_candidates(
        self,
        frame: pd.DataFrame,
        probability_column: str = "trend_probability",
        volume_column: str = "volume_rel_30",
        volatility_column: str = "volatility_30m",
    ) -> pd.DataFrame:
        if frame.empty or probability_column not in frame.columns:
            return pd.DataFrame()

        board = frame.copy()
        board["probability_score"] = board[probability_column]
        board["liquidity_score"] = 0.0
        board["volatility_score"] = 0.0

        if volume_column in board.columns:
            board["liquidity_score"] = board[volume_column].rank(pct=True, ascending=False).fillna(0)

        if volatility_column in board.columns:
            board["volatility_score"] = 1 - board[volatility_column].rank(pct=True, ascending=False).fillna(0)

        board["entry_score"] = (
            0.55 * board["probability_score"]
            + 0.30 * board["liquidity_score"]
            + 0.15 * board["volatility_score"]
        )
        board = board.sort_values("entry_score", ascending=False).head(self.top_n)
        board = board.reset_index(drop=True)
        return board

    def top_n(self, frame: pd.DataFrame, n: int | None = None) -> pd.DataFrame:
        return self.rank_candidates(frame, probability_column="trend_probability").head(n or self.top_n)
