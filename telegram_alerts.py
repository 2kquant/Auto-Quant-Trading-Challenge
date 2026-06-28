import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ENV_PATH = Path(__file__).resolve().parent / ".env"
TELEGRAM_API_URL = "https://api.telegram.org"


def load_env_file(path: Path = ENV_PATH) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def _to_float(value: Any, fallback: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _format_price(value: Any) -> str:
    number = _to_float(value)
    return f"{number:,.0f}" if number >= 100 else f"{number:,.4f}"


def _format_probability(value: Any) -> str:
    number = _to_float(value)
    if 0 <= number <= 1:
        number *= 100
    return f"{number:.2f}%"


def _format_pnl(value: Any) -> str:
    number = _to_float(value)
    return f"{number:+.2f}%"


def build_buy_message(market: str, price: Any, probability: Any) -> str:
    return "\n".join(
        [
            "🟢 BUY",
            f"Market: {market}",
            f"Price: {_format_price(price)}",
            f"Probability: {_format_probability(probability)}",
        ],
    )


def build_sell_message(market: str, exit_price: Any, pnl: Any) -> str:
    return "\n".join(
        [
            "🔴 SELL",
            f"Market: {market}",
            f"Exit Price: {_format_price(exit_price)}",
            f"PnL: {_format_pnl(pnl)}",
        ],
    )


def build_error_message(message: str) -> str:
    return "\n".join(
        [
            "⚠ ERROR",
            message,
        ],
    )


def send_telegram_message(message: str) -> bool:
    load_env_file()

    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required")

    payload = urllib.parse.urlencode(
        {
            "chat_id": chat_id,
            "text": message,
        },
    ).encode("utf-8")

    request = urllib.request.Request(
        f"{TELEGRAM_API_URL}/bot{token}/sendMessage",
        data=payload,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return 200 <= response.status < 300
    except urllib.error.URLError:
        return False


def send_buy_alert(market: str, price: Any, probability: Any) -> bool:
    return send_telegram_message(build_buy_message(market, price, probability))


def send_sell_alert(market: str, exit_price: Any, pnl: Any) -> bool:
    return send_telegram_message(build_sell_message(market, exit_price, pnl))


def send_error_alert(message: str) -> bool:
    return send_telegram_message(build_error_message(message))
