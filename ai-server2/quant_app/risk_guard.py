from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

import numpy as np
import pandas as pd


RISK_LEVELS = {
    "normal": 0,
    "caution": 1,
    "block_new_entries": 2,
    "reduce_only": 3,
    "kill_switch": 4,
}


@dataclass(frozen=True)
class RiskGuardConfig:
    max_data_delay_seconds: int = 180
    btc_drop_15m_block: float = -0.035
    btc_drop_60m_reduce: float = -0.065
    eth_drop_15m_block: float = -0.045
    eth_drop_60m_reduce: float = -0.080
    asset_drop_5m_block: float = -0.030
    asset_drop_15m_block: float = -0.050
    asset_drop_60m_reduce: float = -0.090
    market_breadth_drop_15m: float = -0.030
    market_breadth_drop_60m: float = -0.060
    market_breadth_ratio_block: float = 0.50
    market_breadth_ratio_reduce: float = 0.70
    min_markets_for_breadth: int = 4
    volatility_shock_ratio_block: float = 3.0
    volatility_shock_ratio_reduce: float = 5.0
    kimp_velocity_15m_block: float = 0.010
    kimp_velocity_60m_reduce: float = 0.020
    kimp_z_block: float = 4.0
    fx_change_60m_block: float = 0.008
    fx_change_1440m_reduce: float = 0.025
    btc_dominance_change_60m_block: float = 0.010
    btc_dominance_z_block: float = 4.0
    spread_15m_block: float = 0.025
    spread_60m_reduce: float = 0.040
    liquidity_rel_120_block: float = 0.15
    orderbook_spread_block: float = 0.006
    block_long_horizons: tuple[str, ...] = ("long_30d", "long_60d")


@dataclass
class RiskEvent:
    level: str
    code: str
    message: str
    market: str | None = None
    value: float | None = None
    threshold: float | None = None


@dataclass
class RiskDecision:
    level: str = "normal"
    allow_new_entries: bool = True
    reduce_only: bool = False
    kill_switch: bool = False
    position_scale: float = 1.0
    blocked_markets: set[str] = field(default_factory=set)
    events: list[RiskEvent] = field(default_factory=list)

    def to_frame(self) -> pd.DataFrame:
        return pd.DataFrame([event.__dict__ for event in self.events])


def evaluate_risk(
    feature_frame: pd.DataFrame,
    *,
    now: pd.Timestamp | None = None,
    config: RiskGuardConfig | None = None,
    expected_markets: Iterable[str] | None = None,
) -> RiskDecision:
    config = config or RiskGuardConfig()
    latest = _latest_rows(feature_frame)
    decision = RiskDecision()
    if latest.empty:
        _add_event(decision, "kill_switch", "empty_input", "No feature rows were supplied.")
        return _finalize(decision)

    _check_data_integrity(decision, latest, now, config, expected_markets)
    _check_market_crash(decision, latest, config)
    _check_market_breadth(decision, latest, config)
    _check_external_shocks(decision, latest, config)
    _check_asset_level_risk(decision, latest, config)
    return _finalize(decision)


def apply_risk_guard(
    signals: pd.DataFrame,
    decision: RiskDecision,
    *,
    horizon: str | None = None,
    config: RiskGuardConfig | None = None,
) -> pd.DataFrame:
    config = config or RiskGuardConfig()
    out = signals.copy()
    if "signal" not in out.columns:
        out["signal"] = 0

    blocked = set(decision.blocked_markets)
    if horizon in config.block_long_horizons:
        blocked.update(out.get("market", out.get("asset", pd.Series(dtype=str))).astype(str).tolist())
        _add_event(
            decision,
            "block_new_entries",
            "disabled_horizon",
            f"{horizon} is disabled for live trading until long-horizon performance improves.",
        )
        decision = _finalize(decision)

    market_col = "market" if "market" in out.columns else "asset" if "asset" in out.columns else None
    blocked_mask = pd.Series(False, index=out.index)
    if market_col:
        blocked_mask = out[market_col].astype(str).isin(blocked)

    global_block = decision.kill_switch or decision.reduce_only or not decision.allow_new_entries
    out["raw_signal"] = out["signal"]
    out.loc[blocked_mask | global_block, "signal"] = 0
    out["risk_level"] = decision.level
    out["risk_allow_new_entries"] = decision.allow_new_entries and not global_block
    out["risk_reduce_only"] = decision.reduce_only
    out["risk_kill_switch"] = decision.kill_switch
    out["risk_position_scale"] = 0.0 if global_block else decision.position_scale
    out["risk_blocked_market"] = blocked_mask
    out["risk_event_count"] = len(decision.events)
    return out


def _latest_rows(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.copy()
    if "timestamp_utc" in df.columns:
        df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"], errors="coerce")
        key = "market" if "market" in df.columns else "asset" if "asset" in df.columns else None
        if key:
            return df.sort_values("timestamp_utc").groupby(key, as_index=False).tail(1).reset_index(drop=True)
    return df.tail(1).reset_index(drop=True)


def _check_data_integrity(
    decision: RiskDecision,
    latest: pd.DataFrame,
    now: pd.Timestamp | None,
    config: RiskGuardConfig,
    expected_markets: Iterable[str] | None,
) -> None:
    if "timestamp_utc" in latest.columns and now is not None:
        ts = pd.to_datetime(latest["timestamp_utc"], errors="coerce")
        now_ts = pd.Timestamp(now)
        if now_ts.tzinfo is not None:
            now_ts = now_ts.tz_convert(None)
        max_ts = ts.max()
        if getattr(max_ts, "tzinfo", None) is not None:
            max_ts = max_ts.tz_convert(None)
        age_seconds = (now_ts - max_ts).total_seconds()
        if age_seconds > config.max_data_delay_seconds:
            _add_event(
                decision,
                "kill_switch",
                "stale_data",
                "Latest candle is older than the allowed data delay.",
                value=float(age_seconds),
                threshold=float(config.max_data_delay_seconds),
            )

    if expected_markets is not None and "market" in latest.columns:
        expected = set(map(str, expected_markets))
        observed = set(latest["market"].astype(str))
        missing = sorted(expected - observed)
        if missing:
            _add_event(
                decision,
                "kill_switch",
                "missing_markets",
                f"Missing required markets: {', '.join(missing)}",
            )

    required = ["close_u", "close_b", "market_fx"]
    missing_cols = [col for col in required if col not in latest.columns or latest[col].isna().all()]
    if missing_cols:
        _add_event(
            decision,
            "block_new_entries",
            "missing_realtime_fields",
            f"Missing realtime risk fields: {', '.join(missing_cols)}",
        )


def _check_market_crash(decision: RiskDecision, latest: pd.DataFrame, config: RiskGuardConfig) -> None:
    for market, prefix, block_15m, reduce_60m in (
        ("KRW-BTC", "btc", config.btc_drop_15m_block, config.btc_drop_60m_reduce),
        ("KRW-ETH", "eth", config.eth_drop_15m_block, config.eth_drop_60m_reduce),
    ):
        row = _row_for_market(latest, market)
        if row is None:
            continue
        ret_15m = _value(row, "ret_15m")
        ret_60m = _value(row, "ret_60m")
        if ret_60m is not None and ret_60m <= reduce_60m:
            _add_event(
                decision,
                "reduce_only",
                f"{prefix}_60m_crash",
                f"{market} 60m return breached reduce-only threshold.",
                market=market,
                value=ret_60m,
                threshold=reduce_60m,
            )
        if ret_15m is not None and ret_15m <= block_15m:
            _add_event(
                decision,
                "block_new_entries",
                f"{prefix}_15m_crash",
                f"{market} 15m return breached new-entry block threshold.",
                market=market,
                value=ret_15m,
                threshold=block_15m,
            )


def _check_market_breadth(decision: RiskDecision, latest: pd.DataFrame, config: RiskGuardConfig) -> None:
    if len(latest) < config.min_markets_for_breadth:
        return
    if "ret_15m" in latest.columns:
        ratio_15m = float((latest["ret_15m"] <= config.market_breadth_drop_15m).mean())
        if ratio_15m >= config.market_breadth_ratio_block:
            _add_event(
                decision,
                "block_new_entries",
                "market_breadth_15m",
                "Too many overlap markets are falling at the same time.",
                value=ratio_15m,
                threshold=config.market_breadth_ratio_block,
            )
    if "ret_60m" in latest.columns:
        ratio_60m = float((latest["ret_60m"] <= config.market_breadth_drop_60m).mean())
        if ratio_60m >= config.market_breadth_ratio_reduce:
            _add_event(
                decision,
                "reduce_only",
                "market_breadth_60m",
                "Broad 60m market drawdown breached reduce-only threshold.",
                value=ratio_60m,
                threshold=config.market_breadth_ratio_reduce,
            )


def _check_external_shocks(decision: RiskDecision, latest: pd.DataFrame, config: RiskGuardConfig) -> None:
    for col, level, code, threshold in (
        ("market_fx_change_60m", "block_new_entries", "fx_60m_shock", config.fx_change_60m_block),
        ("market_fx_change_1440m", "reduce_only", "fx_1440m_shock", config.fx_change_1440m_reduce),
        ("btc_dominance_change_60m", "block_new_entries", "btc_dominance_60m_shock", config.btc_dominance_change_60m_block),
        ("btc_dominance_z_1440", "block_new_entries", "btc_dominance_z_shock", config.btc_dominance_z_block),
    ):
        if col not in latest.columns:
            continue
        value = _max_abs(latest[col])
        if value is not None and value >= threshold:
            _add_event(decision, level, code, f"{col} exceeded shock threshold.", value=value, threshold=threshold)

    for col, level, code, threshold in (
        ("kimp_velocity_15m", "block_new_entries", "kimp_15m_shock", config.kimp_velocity_15m_block),
        ("kimp_velocity_60m", "reduce_only", "kimp_60m_shock", config.kimp_velocity_60m_reduce),
        ("kimp_z_1440", "block_new_entries", "kimp_z_shock", config.kimp_z_block),
    ):
        if col not in latest.columns:
            continue
        value = _max_abs(latest[col])
        if value is not None and value >= threshold:
            _add_event(decision, level, code, f"{col} exceeded shock threshold.", value=value, threshold=threshold)


def _check_asset_level_risk(decision: RiskDecision, latest: pd.DataFrame, config: RiskGuardConfig) -> None:
    market_col = "market" if "market" in latest.columns else None
    for _, row in latest.iterrows():
        market = str(row[market_col]) if market_col else None
        checks = [
            ("ret_5m", config.asset_drop_5m_block, "caution", "asset_5m_drop"),
            ("ret_15m", config.asset_drop_15m_block, "caution", "asset_15m_drop"),
            ("ret_60m", config.asset_drop_60m_reduce, "caution", "asset_60m_drop"),
            ("upbit_binance_ret_spread_15m", config.spread_15m_block, "caution", "upbit_binance_15m_divergence"),
            ("upbit_binance_ret_spread_60m", config.spread_60m_reduce, "caution", "upbit_binance_60m_divergence"),
        ]
        for col, threshold, level, code in checks:
            value = _value(row, col)
            if value is None:
                continue
            breached = abs(value) >= threshold if "spread" in col else value <= threshold
            if breached:
                if market:
                    decision.blocked_markets.add(market)
                _add_event(decision, level, code, f"{col} breached threshold.", market=market, value=value, threshold=threshold)

        vol_60m = _value(row, "volatility_60m")
        vol_1440m = _value(row, "volatility_1440m")
        if vol_60m is not None and vol_1440m is not None and vol_1440m > 0:
            ratio = vol_60m / vol_1440m
            if ratio >= config.volatility_shock_ratio_reduce:
                if market:
                    decision.blocked_markets.add(market)
                _add_event(decision, "caution", "asset_volatility_reduce", "Volatility shock breached reduce threshold.", market=market, value=ratio, threshold=config.volatility_shock_ratio_reduce)
            elif ratio >= config.volatility_shock_ratio_block:
                if market:
                    decision.blocked_markets.add(market)
                _add_event(decision, "caution", "asset_volatility_block", "Volatility shock breached block threshold.", market=market, value=ratio, threshold=config.volatility_shock_ratio_block)

        liquidity = _value(row, "value_rel_120")
        if liquidity is not None and liquidity <= config.liquidity_rel_120_block:
            if market:
                decision.blocked_markets.add(market)
            _add_event(decision, "caution", "liquidity_drought", "Relative traded value is too low.", market=market, value=liquidity, threshold=config.liquidity_rel_120_block)

        for spread_col in ("orderbook_spread_pct", "spread_pct"):
            spread = _value(row, spread_col)
            if spread is not None and spread >= config.orderbook_spread_block:
                if market:
                    decision.blocked_markets.add(market)
                _add_event(decision, "caution", "wide_orderbook_spread", "Orderbook spread is too wide.", market=market, value=spread, threshold=config.orderbook_spread_block)


def _add_event(
    decision: RiskDecision,
    level: str,
    code: str,
    message: str,
    *,
    market: str | None = None,
    value: float | None = None,
    threshold: float | None = None,
) -> None:
    decision.events.append(RiskEvent(level=level, code=code, message=message, market=market, value=value, threshold=threshold))
    if RISK_LEVELS[level] > RISK_LEVELS[decision.level]:
        decision.level = level


def _finalize(decision: RiskDecision) -> RiskDecision:
    decision.kill_switch = decision.level == "kill_switch"
    decision.reduce_only = decision.level in {"reduce_only", "kill_switch"}
    decision.allow_new_entries = decision.level in {"normal", "caution"} and not decision.kill_switch
    if decision.level == "caution":
        decision.position_scale = 0.50
    elif decision.level in {"block_new_entries", "reduce_only", "kill_switch"}:
        decision.position_scale = 0.0
    else:
        decision.position_scale = 1.0
    return decision


def _row_for_market(frame: pd.DataFrame, market: str) -> pd.Series | None:
    if "market" not in frame.columns:
        return None
    rows = frame[frame["market"].astype(str).eq(market)]
    if rows.empty:
        return None
    return rows.iloc[-1]


def _value(row: pd.Series, col: str) -> float | None:
    if col not in row.index:
        return None
    value = row[col]
    if pd.isna(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _max_abs(series: pd.Series) -> float | None:
    values = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    if values.empty:
        return None
    return float(values.abs().max())
