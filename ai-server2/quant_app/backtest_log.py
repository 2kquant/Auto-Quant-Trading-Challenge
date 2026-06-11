from __future__ import annotations

from dataclasses import dataclass
import pandas as pd


@dataclass
class BacktestEntry:
    market: str
    entry_time: pd.Timestamp
    exit_time: pd.Timestamp | None
    entry_price: float
    exit_price: float | None
    signal_probability: float
    realized_return: float | None
    reason: str


class BacktestLogger:
    def __init__(self, fee_bps: float = 5.0) -> None:
        self.fee_bps = fee_bps
        self.logs: list[BacktestEntry] = []

    def simulate_entries(
        self,
        signals: pd.DataFrame,
        price_column: str = "close_u",
        future_return_column: str = "future_return_30m",
        horizon_minutes: int = 30,
    ) -> pd.DataFrame:
        if signals.empty:
            return pd.DataFrame()

        self.logs = []
        grouped = signals.groupby("market", group_keys=False)

        for _, row in signals[signals["signal"] == 1].iterrows():
            market = row["market"]
            entry_time = pd.to_datetime(row["timestamp_utc"])
            entry_price = float(row.get(price_column, float("nan")))
            signal_probability = float(row.get("trend_probability", 0.0))
            realized_return = None
            exit_time = None
            exit_price = None
            reason = row.get("reason", "매수 후보")

            if future_return_column in row.index:
                realized_return = float(row[future_return_column])

            if "exit_price" in row.index:
                exit_price = float(row["exit_price"])
                exit_time = pd.to_datetime(row.get("exit_time", entry_time))
            else:
                exit_time = entry_time + pd.Timedelta(minutes=horizon_minutes)

            self.logs.append(
                BacktestEntry(
                    market=market,
                    entry_time=entry_time,
                    exit_time=exit_time,
                    entry_price=entry_price,
                    exit_price=exit_price,
                    signal_probability=signal_probability,
                    realized_return=realized_return,
                    reason=reason,
                )
            )

        return self.to_frame()

    def to_frame(self) -> pd.DataFrame:
        if not self.logs:
            return pd.DataFrame()

        return pd.DataFrame(
            [
                {
                    "market": log.market,
                    "entry_time": log.entry_time,
                    "exit_time": log.exit_time,
                    "entry_price": log.entry_price,
                    "exit_price": log.exit_price,
                    "signal_probability": log.signal_probability,
                    "realized_return": log.realized_return,
                    "reason": log.reason,
                }
                for log in self.logs
            ]
        )

    def summary(self) -> dict[str, float]:
        frame = self.to_frame()
        if frame.empty:
            return {}

        out = {
            "trades": float(len(frame)),
            "average_probability": float(frame["signal_probability"].mean()),
        }
        if "realized_return" in frame.columns:
            returns = frame["realized_return"].dropna()
            out["average_realized_return"] = float(returns.mean()) if not returns.empty else 0.0
            out["win_rate"] = float((returns > 0).mean()) if not returns.empty else 0.0
        return out


def simulate_entry_backtest(
    signals: pd.DataFrame,
    price_column: str = "close_u",
    future_return_column: str = "future_return_30m",
    horizon_minutes: int = 30,
    fee_bps: float = 5.0,
) -> pd.DataFrame:
    logger = BacktestLogger(fee_bps=fee_bps)
    return logger.simulate_entries(
        signals=signals,
        price_column=price_column,
        future_return_column=future_return_column,
        horizon_minutes=horizon_minutes,
    )
