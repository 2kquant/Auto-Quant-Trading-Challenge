import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from trading_state import TradingCommand, TradingStateStore


DASHBOARD_URL = "https://auto-quant-trading-challenge-gwhj.vercel.app/"
TELEGRAM_ADMIN_HEADER = "X-Telegram-Admin-Secret"

LABEL_DASHBOARD = "\U0001F4CA Dashboard"
LABEL_BALANCE = "\U0001F4B0 Balance"
LABEL_POSITIONS = "\U0001F4C8 Positions"
LABEL_PNL = "\U0001F4C9 PnL"
LABEL_START_PAPER = "\U0001F4B5 Start Paper Trading"
LABEL_START_LIVE = "\U0001F916 Start Live Trading"
LABEL_PAUSE = "\u23F8\uFE0F Pause Trading"
LABEL_STOP = "\U0001F6D1 Stop Trading"
LABEL_CLOSE_ALL = "\U0001F6A8 Close All Positions"
LABEL_SETTINGS = "\u2699\uFE0F Settings"
LABEL_TRADE_LOGS = "\U0001F4DC Trade Logs"
LABEL_AI_LOGS = "\U0001F4CA AI Logs"


def build_limited_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("Open Website", url=DASHBOARD_URL),
                InlineKeyboardButton("Login", url=DASHBOARD_URL),
            ],
            [InlineKeyboardButton("Settings", callback_data="settings")],
        ],
    )


def build_full_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton(LABEL_DASHBOARD, url=DASHBOARD_URL)],
            [
                InlineKeyboardButton(LABEL_BALANCE, callback_data="balance"),
                InlineKeyboardButton(LABEL_POSITIONS, callback_data="positions"),
            ],
            [
                InlineKeyboardButton(LABEL_PNL, callback_data="pnl"),
                InlineKeyboardButton(LABEL_SETTINGS, callback_data="settings"),
            ],
            [
                InlineKeyboardButton(
                    LABEL_START_PAPER,
                    callback_data="control:start_paper",
                ),
                InlineKeyboardButton(
                    LABEL_START_LIVE,
                    callback_data="control:start_live",
                ),
            ],
            [
                InlineKeyboardButton(LABEL_PAUSE, callback_data="control:pause"),
                InlineKeyboardButton(LABEL_STOP, callback_data="control:stop"),
            ],
            [
                InlineKeyboardButton(
                    LABEL_CLOSE_ALL,
                    callback_data="control:close_all",
                ),
            ],
            [
                InlineKeyboardButton(LABEL_TRADE_LOGS, callback_data="trade_logs"),
                InlineKeyboardButton(LABEL_AI_LOGS, callback_data="ai_logs"),
            ],
        ],
    )


def build_main_keyboard(is_linked: bool = False) -> InlineKeyboardMarkup:
    return build_full_keyboard() if is_linked else build_limited_keyboard()


def _api_base() -> str:
    return os.getenv("TELEGRAM_STATUS_API_URL", "").rstrip("/")


def _admin_secret() -> str:
    return os.getenv("TELEGRAM_ADMIN_SECRET", "")


def _add_telegram_auth(request: urllib.request.Request) -> None:
    admin_secret = _admin_secret()

    if admin_secret:
        request.add_header(TELEGRAM_ADMIN_HEADER, admin_secret)


def _request_json(path: str) -> Any:
    api_base = _api_base()

    if not api_base:
        return None

    request = urllib.request.Request(f"{api_base}{path}")
    _add_telegram_auth(request)

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def _post_json(path: str, payload: dict[str, Any]) -> Any:
    api_base = _api_base()

    if not api_base:
        return None

    request = urllib.request.Request(
        f"{api_base}{path}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    _add_telegram_auth(request)

    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def _query(params: dict[str, Any]) -> str:
    return urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})


def is_linked_chat(chat_id: int | str | None) -> bool:
    if chat_id is None:
        return False

    data = _request_json(f"/api/telegram/auth?{_query({'chatId': chat_id})}")
    return isinstance(data, dict) and data.get("linked") is True


def _format_krw(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0

    return f"{number:,.0f} KRW"


def _format_pct(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0

    return f"{number:+.2f}%"


def get_balance_message(chat_id: int | str | None) -> str:
    data = _request_json(f"/api/paper/wallet?{_query({'telegramChatId': chat_id})}")

    if isinstance(data, dict):
        account = data.get("account") or {}
        return "\n".join(
            [
                LABEL_BALANCE,
                f"Paper KRW: {_format_krw(account.get('virtualBalance', 0))}",
                f"Paper PnL: {_format_krw(account.get('virtualPnl', 0))}",
            ],
        )

    fallback = os.getenv("TELEGRAM_DEFAULT_KRW_BALANCE", "0")
    return f"{LABEL_BALANCE}\nKRW: {_format_krw(fallback)}"


def get_positions_message(chat_id: int | str | None) -> str:
    data = _request_json(f"/telegram/positions?{_query({'telegramChatId': chat_id})}")
    positions = data.get("positions", []) if isinstance(data, dict) else []

    if not isinstance(positions, list) or not positions:
        return f"{LABEL_POSITIONS}\nNo active positions."

    lines = [LABEL_POSITIONS]

    for item in positions[:10]:
        if not isinstance(item, dict):
            continue

        symbol = item.get("symbol") or item.get("market") or "-"
        qty = item.get("qty", item.get("quantity", 0))
        avg_price = item.get("avgPrice", item.get("avg_price", 0))
        lines.append(f"- {symbol} / qty {qty} / avg {_format_krw(avg_price)}")

    return "\n".join(lines)


def get_pnl_message(chat_id: int | str | None) -> str:
    data = _request_json(f"/api/paper/wallet?{_query({'telegramChatId': chat_id})}")

    if isinstance(data, dict):
        account = data.get("account") or {}
        return "\n".join(
            [
                LABEL_PNL,
                f"Paper PnL: {_format_krw(account.get('virtualPnl', 0))}",
            ],
        )

    pnl_rate = os.getenv("TELEGRAM_DEFAULT_PNL_RATE", "0")
    pnl_value = os.getenv("TELEGRAM_DEFAULT_PNL", "0")
    return f"{LABEL_PNL}\nRate: {_format_pct(pnl_rate)}\nPnL: {_format_krw(pnl_value)}"


def get_trade_logs_message(chat_id: int | str | None) -> str:
    data = _request_json(
        f"/api/trade-logs?{_query({'telegramChatId': chat_id, 'limit': 5})}",
    )
    logs = data.get("logs", []) if isinstance(data, dict) else []

    if not logs:
        return f"{LABEL_TRADE_LOGS}\nNo trade logs yet."

    lines = [LABEL_TRADE_LOGS]
    for item in logs[:5]:
        if not isinstance(item, dict):
            continue
        mode = item.get("mode", "-")
        side = item.get("side", "-")
        market = item.get("market", "-")
        price = item.get("price") or item.get("entryPrice") or item.get("exitPrice") or 0
        probability = item.get("probability")
        probability_text = (
            f" / prob {float(probability) * 100:.2f}%"
            if isinstance(probability, (int, float))
            else ""
        )
        lines.append(f"- {mode} {side} {market} @ {_format_krw(price)}{probability_text}")

    return "\n".join(lines)


def get_ai_logs_message(chat_id: int | str | None) -> str:
    data = _request_json(
        f"/api/ai-logs?{_query({'telegramChatId': chat_id, 'limit': 5})}",
    )
    logs = data.get("logs", []) if isinstance(data, dict) else []

    if not logs:
        return f"{LABEL_AI_LOGS}\nNo AI decision logs yet."

    lines = [LABEL_AI_LOGS]
    for item in logs[:5]:
        if not isinstance(item, dict):
            continue
        market = item.get("market", "-")
        decision = item.get("finalDecision", "-")
        trend = item.get("trendProbability")
        confidence = item.get("confidence")
        lines.append(
            f"- {market}: {decision} / trend {trend or '-'} / confidence {confidence or '-'}",
        )

    return "\n".join(lines)


def get_settings_message(chat_id: int | str | None) -> str:
    trading_state = _request_json("/api/trading-control")
    mode_data = _request_json(f"/api/trading-mode?{_query({'telegramChatId': chat_id})}")

    if isinstance(trading_state, dict):
        status = str(trading_state.get("status", "Stopped")).title()
        updated_at = trading_state.get("updatedAt", "-")
    else:
        state = TradingStateStore().read()
        status = state.status
        updated_at = state.updated_at

    mode = mode_data.get("mode", "PAPER") if isinstance(mode_data, dict) else "PAPER"

    return "\n".join(
        [
            LABEL_SETTINGS,
            f"Dashboard: {DASHBOARD_URL}",
            f"Trading Mode: {mode}",
            f"Trading Status: {status}",
            f"Updated At: {updated_at}",
        ],
    )


def get_limited_settings_message(chat_id: int | str | None) -> str:
    return "\n".join(
        [
            "Settings",
            "Telegram account is not linked yet.",
            f"Chat ID: {chat_id or '-'}",
            "Login to the website and save this Chat ID in Settings > Telegram.",
        ],
    )


def set_trading_mode(chat_id: int | str | None, mode: str) -> None:
    _post_json(
        "/api/trading-mode",
        {
            "telegramChatId": str(chat_id or ""),
            "mode": mode,
        },
    )


def dispatch_trading_command(
    command: TradingCommand,
    chat_id: int | str | None = None,
) -> str:
    if command == "START_PAPER":
        set_trading_mode(chat_id, "PAPER")
    elif command == "START_LIVE":
        set_trading_mode(chat_id, "LIVE")

    remote_result = _post_json("/api/trading-control", {"command": command})
    local_state = TradingStateStore().dispatch(command)

    action_by_command = {
        "START": "Trading started",
        "START_PAPER": "Paper trading started",
        "START_LIVE": "Live trading started",
        "PAUSE": "New entries paused. Existing positions stay open.",
        "STOP": "Trading stopped",
        "CLOSE_ALL": "Close all positions requested",
    }
    sync_state = "Remote API synced" if isinstance(remote_result, dict) else "Local state updated"

    return "\n".join(
        [
            "Trading Control",
            action_by_command.get(command, "Command accepted"),
            f"Status: {local_state.status}",
            sync_state,
        ],
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    del context

    if not update.message:
        return

    chat_id = update.effective_chat.id if update.effective_chat else None
    linked = is_linked_chat(chat_id)

    await update.message.reply_text(
        "2KQuant bot is ready. Choose an action.",
        reply_markup=build_main_keyboard(linked),
    )


async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    del context

    query = update.callback_query

    if not query:
        return

    await query.answer()

    data = query.data or ""
    chat_id = update.effective_chat.id if update.effective_chat else None
    linked = is_linked_chat(chat_id)

    if not linked:
        await query.edit_message_text(
            get_limited_settings_message(chat_id),
            reply_markup=build_main_keyboard(False),
        )
        return

    command_map: dict[str, TradingCommand] = {
        "control:start": "START",
        "control:start_paper": "START_PAPER",
        "control:start_live": "START_LIVE",
        "control:pause": "PAUSE",
        "control:stop": "STOP",
        "control:close_all": "CLOSE_ALL",
    }

    if data in command_map:
        message = dispatch_trading_command(command_map[data], chat_id)
    elif data == "balance":
        message = get_balance_message(chat_id)
    elif data == "positions":
        message = get_positions_message(chat_id)
    elif data == "pnl":
        message = get_pnl_message(chat_id)
    elif data == "settings":
        message = get_settings_message(chat_id)
    elif data == "trade_logs":
        message = get_trade_logs_message(chat_id)
    elif data == "ai_logs":
        message = get_ai_logs_message(chat_id)
    else:
        message = "Unknown action."

    await query.edit_message_text(
        message,
        reply_markup=build_main_keyboard(True),
    )
