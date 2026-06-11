from __future__ import annotations

from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]

PREFERRED_FILES = [
    ROOT / "sample.csv",
    ROOT / "newdata" / "binance_coin_candles.csv",
    ROOT / "newdata" / "upbit_coin_candles.csv",
]


def _size_mb(path: Path) -> float:
    return path.stat().st_size / 1024 / 1024


def catalog_sources() -> pd.DataFrame:
    rows: list[dict[str, object]] = []

    for path in PREFERRED_FILES:
        if path.exists():
            rows.append(
                {
                    "key": str(path.relative_to(ROOT)),
                    "name": path.relative_to(ROOT).as_posix(),
                    "path": str(path),
                    "kind": path.suffix.lower().lstrip("."),
                    "size_mb": _size_mb(path),
                }
            )

    coin_dir = ROOT / "coin_files"
    if coin_dir.exists():
        for path in sorted(coin_dir.glob("*.parquet")):
            rows.append(
                {
                    "key": str(path.relative_to(ROOT)),
                    "name": path.relative_to(ROOT).as_posix(),
                    "path": str(path),
                    "kind": "parquet",
                    "size_mb": _size_mb(path),
                }
            )

    return pd.DataFrame(rows)


def load_source(source_key: str, max_rows: int = 100_000) -> pd.DataFrame:
    path = (ROOT / source_key).resolve()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(source_key)
    if ROOT not in path.parents and path != ROOT:
        raise ValueError(f"Source is outside project root: {source_key}")

    suffix = path.suffix.lower()
    if suffix == ".csv":
        frame = pd.read_csv(path, nrows=max_rows)
    elif suffix == ".parquet":
        frame = _read_parquet_limited(path, max_rows)
    else:
        raise ValueError(f"Unsupported data file: {path.name}")

    return standardize_frame(frame)


def standardize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    df = frame.copy()
    df.columns = [str(col).strip() for col in df.columns]

    time_col = _first_existing(df, ["timestamp_utc", "open_time", "time", "datetime", "date"])
    if time_col:
        df["time"] = pd.to_datetime(df[time_col], errors="coerce", utc=True)
    elif "timestamp_kst" in df.columns:
        df["time"] = pd.to_datetime(df["timestamp_kst"], errors="coerce")
    else:
        df["time"] = pd.NaT

    asset_col = _first_existing(df, ["symbol", "original_symbol", "market", "ticker"])
    if asset_col:
        df["asset"] = df[asset_col].astype(str)
    elif "exchange" in df.columns:
        df["asset"] = df["exchange"].astype(str)
    else:
        df["asset"] = "UNKNOWN"

    if "close" not in df.columns:
        close_col = _first_existing(df, ["close_u", "trade_price", "close_b"])
        if close_col:
            df["close"] = pd.to_numeric(df[close_col], errors="coerce")

    for standard_col, candidates in {
        "open": ["open", "open_u", "opening_price", "open_b"],
        "high": ["high", "high_u", "high_price", "high_b"],
        "low": ["low", "low_u", "low_price", "low_b"],
        "volume": ["volume", "volume_u", "candle_acc_trade_volume", "volume_b"],
        "quote_asset_volume": ["quote_asset_volume", "value", "candle_acc_trade_price"],
    }.items():
        if standard_col not in df.columns:
            source = _first_existing(df, candidates)
            if source:
                df[standard_col] = pd.to_numeric(df[source], errors="coerce")

    numeric_candidates = [
        "open",
        "high",
        "low",
        "close",
        "volume",
        "quote_asset_volume",
        "value",
        "kimp_real",
        "target_return_30m",
        "kimp_velocity",
        "vol_ratio",
        "volatility_30m",
        "market_fx",
        "close_u",
        "close_b",
    ]
    for col in numeric_candidates:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["time", "close"]).sort_values(["asset", "time"])
    return df.reset_index(drop=True)


def _first_existing(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    return None


def _read_parquet_limited(path: Path, max_rows: int) -> pd.DataFrame:
    try:
        import pyarrow.parquet as pq
    except ImportError:
        frame = pd.read_parquet(path)
        return frame.head(max_rows)

    parquet_file = pq.ParquetFile(path)
    batches = []
    rows = 0
    for group_index in range(parquet_file.num_row_groups):
        table = parquet_file.read_row_group(group_index)
        batches.append(table)
        rows += table.num_rows
        if rows >= max_rows:
            break

    if not batches:
        return pd.DataFrame()

    import pyarrow as pa

    frame = pa.concat_tables(batches).to_pandas()
    return frame.head(max_rows)
