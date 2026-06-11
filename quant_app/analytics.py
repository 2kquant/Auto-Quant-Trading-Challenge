from __future__ import annotations

import numpy as np
import pandas as pd


def add_features(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.copy()
    if df.empty or "asset" not in df.columns or "time" not in df.columns or "close" not in df.columns:
        return df

    df = df.sort_values(["asset", "time"]).reset_index(drop=True)
    grouped = df.groupby("asset", group_keys=False)

    df["return_1"] = grouped["close"].pct_change()
    df["log_return"] = np.log(df["close"]).groupby(df["asset"]).diff()
    df["ma_20"] = grouped["close"].transform(lambda s: s.rolling(20, min_periods=5).mean())
    df["ma_60"] = grouped["close"].transform(lambda s: s.rolling(60, min_periods=10).mean())
    df["volatility_30"] = grouped["return_1"].transform(lambda s: s.rolling(30, min_periods=10).std())
    df["future_return_30"] = grouped["close"].transform(lambda s: s.shift(-30) / s - 1)

    if "quote_asset_volume" in df.columns:
        liquidity_source = "quote_asset_volume"
    elif "value" in df.columns:
        liquidity_source = "value"
    else:
        liquidity_source = None

    if liquidity_source:
        df["liquidity"] = pd.to_numeric(df[liquidity_source], errors="coerce")
        df["liquidity_ma_30"] = grouped["liquidity"].transform(lambda s: s.rolling(30, min_periods=5).mean())

    rolling_max = grouped["close"].transform(lambda s: s.cummax())
    df["drawdown"] = df["close"] / rolling_max - 1
    return df


def latest_snapshot(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame()

    rows = frame.sort_values("time").groupby("asset", as_index=False).tail(1)
    keep = [
        "asset",
        "time",
        "close",
        "return_1",
        "volatility_30",
        "drawdown",
        "liquidity",
        "kimp_real",
        "target_return_30m",
    ]
    keep = [col for col in keep if col in rows.columns]
    return rows[keep].sort_values("asset").reset_index(drop=True)


def signal_board(frame: pd.DataFrame) -> pd.DataFrame:
    latest = latest_snapshot(frame)
    if latest.empty:
        return latest

    board = latest.copy()
    board["trend"] = board["asset"].map(_latest_trend(frame))
    board["liquidity_rank"] = _percent_rank(board.get("liquidity", pd.Series(index=board.index, dtype=float)))
    board["trend_rank"] = _percent_rank(board["trend"])
    board["vol_rank"] = 1 - _percent_rank(board.get("volatility_30", pd.Series(index=board.index, dtype=float)))
    board["score"] = (
        100
        * (
            0.45 * board["trend_rank"].fillna(0.5)
            + 0.35 * board["liquidity_rank"].fillna(0.5)
            + 0.20 * board["vol_rank"].fillna(0.5)
        )
    ).round(0)
    board = board.rename(columns={"return_1": "last_return", "volatility_30": "volatility"})
    columns = ["asset", "score", "trend", "last_return", "volatility", "liquidity"]
    return board[[col for col in columns if col in board.columns]].sort_values("score", ascending=False)


def factor_correlations(frame: pd.DataFrame, target: str) -> pd.DataFrame:
    if frame.empty or target not in frame.columns:
        return pd.DataFrame()

    numeric = frame.select_dtypes(include=[np.number]).copy()
    if target not in numeric.columns:
        return pd.DataFrame()

    blacklist = {
        target,
        "open",
        "high",
        "low",
        "close",
        "close_u",
        "close_b",
        "ma_20",
        "ma_60",
    }
    rows = []
    for col in numeric.columns:
        if col in blacklist:
            continue
        pair = numeric[[col, target]].replace([np.inf, -np.inf], np.nan).dropna()
        if len(pair) < 20 or pair[col].nunique() < 2:
            continue
        rows.append({"factor": col, "correlation": pair[col].corr(pair[target])})

    out = pd.DataFrame(rows)
    if out.empty:
        return out
    out["abs_correlation"] = out["correlation"].abs()
    return out.sort_values("abs_correlation", ascending=False).reset_index(drop=True)


def backtest_moving_average(
    frame: pd.DataFrame,
    fast_window: int = 20,
    slow_window: int = 60,
    fee_bps: float = 5.0,
) -> tuple[pd.DataFrame, dict[str, float]]:
    if frame.empty or len(frame) < max(fast_window, slow_window) + 5:
        return pd.DataFrame(), {}

    if fast_window >= slow_window:
        fast_window = max(2, slow_window - 1)

    bt = frame.sort_values("time").copy()
    bt["fast_ma"] = bt["close"].rolling(fast_window, min_periods=fast_window).mean()
    bt["slow_ma"] = bt["close"].rolling(slow_window, min_periods=slow_window).mean()
    bt["signal"] = (bt["fast_ma"] > bt["slow_ma"]).astype(int).shift(1).fillna(0)
    bt["return_1"] = bt["close"].pct_change().fillna(0)
    bt["trade"] = bt["signal"].diff().abs().fillna(0)
    bt["strategy_return"] = bt["signal"] * bt["return_1"] - bt["trade"] * fee_bps / 10_000
    bt["equity"] = (1 + bt["strategy_return"]).cumprod()
    bt["buy_and_hold"] = (1 + bt["return_1"]).cumprod()
    bt["drawdown"] = bt["equity"] / bt["equity"].cummax() - 1

    stats = {
        "total_return": float(bt["equity"].iloc[-1] - 1),
        "max_drawdown": float(bt["drawdown"].min()),
        "win_rate": float((bt.loc[bt["strategy_return"] != 0, "strategy_return"] > 0).mean()),
        "trades": float(bt["trade"].sum()),
    }
    return bt, stats


def _latest_trend(frame: pd.DataFrame) -> pd.Series:
    rows = frame.sort_values("time").groupby("asset", as_index=False).tail(1).set_index("asset")
    if "ma_20" not in rows.columns:
        return pd.Series(index=rows.index, dtype=float)
    trend = rows["close"] / rows["ma_20"] - 1
    return trend


def _percent_rank(series: pd.Series) -> pd.Series:
    if series is None or series.empty:
        return pd.Series(dtype=float)
    return series.astype(float).rank(pct=True)
