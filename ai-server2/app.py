from flask import Flask, jsonify
import pickle
import pandas as pd
import ccxt

from quant_app.realtime_model import build_realtime_features

app = Flask(__name__)

MODEL_FILE = "Low_conf.pkl"

with open(MODEL_FILE, "rb") as f:
    model = pickle.load(f)

# XGBoost 호환 패치
for h in model.available_horizons():
    xgb = model.models[h].model

    patches = {
        "use_label_encoder": False,
        "gpu_id": None,
        "predictor": None,
    }

    for k, v in patches.items():
        if not hasattr(xgb, k):
            setattr(xgb, k, v)

exchange = ccxt.upbit()

MARKETS = [
    "KRW-BTC",
    "KRW-ETH",
    "KRW-XRP",
    "KRW-SOL",
    "KRW-ADA",
]


@app.route("/signal")
def signal():

    results = []

    for market in MARKETS:

        try:

            ohlcv = exchange.fetch_ohlcv(
                market,
                timeframe="1m",
                limit=200
            )

            rows = []

            for candle in ohlcv:
                ts, o, h, l, c, v = candle

                rows.append({
                    "market": market,
                    "timestamp_utc": pd.to_datetime(ts, unit="ms"),
                    "open_u": o,
                    "high_u": h,
                    "low_u": l,
                    "close_u": c,
                    "volume_u": v,
                })

            df = pd.DataFrame(rows)

            features = build_realtime_features(
                df,
                include_target=False
            )

            latest = (
                features
                .sort_values("timestamp_utc")
                .groupby("market")
                .tail(1)
            )

            pred = model.predict_signal(
                latest,
                horizon="short_30m"
            )

            row = pred.iloc[0]

            results.append({
                "market": market,
                "price": float(row["close_u"]),
                "probability": float(row["trend_probability"]),
                "signal": int(row["signal"]),
                "threshold": float(row["threshold"]),
            })

        except Exception as e:

            results.append({
                "market": market,
                "error": str(e)
            })

    return jsonify(results)


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=8000,
        debug=True
    )