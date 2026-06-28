import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal


TradingStatus = Literal["Running", "Paused", "Stopped"]
TradingCommand = Literal[
    "START",
    "START_PAPER",
    "START_LIVE",
    "PAUSE",
    "STOP",
    "CLOSE_ALL",
]


@dataclass(frozen=True)
class TradingState:
    status: TradingStatus
    last_command: TradingCommand | None
    command_id: int
    updated_at: str


class TradingStateStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or Path(__file__).resolve().parent / ".telegram_trading_state.json"

    def read(self) -> TradingState:
        if not self.path.exists():
            return self._default_state()

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return self._default_state()

        status = data.get("status", "Stopped")

        if status not in {"Running", "Paused", "Stopped"}:
            status = "Stopped"

        last_command = data.get("last_command")

        if last_command not in {
            "START",
            "START_PAPER",
            "START_LIVE",
            "PAUSE",
            "STOP",
            "CLOSE_ALL",
        }:
            last_command = None

        return TradingState(
            status=status,
            last_command=last_command,
            command_id=int(data.get("command_id", 0) or 0),
            updated_at=str(data.get("updated_at", self._now())),
        )

    def dispatch(self, command: TradingCommand) -> TradingState:
        current = self.read()
        status = self._status_for_command(command, current.status)
        next_state = TradingState(
            status=status,
            last_command=command,
            command_id=current.command_id + 1,
            updated_at=self._now(),
        )
        self._write(next_state)
        return next_state

    def _write(self, state: TradingState) -> None:
        self.path.write_text(
            json.dumps(
                {
                    "status": state.status,
                    "last_command": state.last_command,
                    "command_id": state.command_id,
                    "updated_at": state.updated_at,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    @staticmethod
    def _default_state() -> TradingState:
        return TradingState(
            status="Stopped",
            last_command=None,
            command_id=0,
            updated_at=TradingStateStore._now(),
        )

    @staticmethod
    def _status_for_command(
        command: TradingCommand,
        current_status: TradingStatus,
    ) -> TradingStatus:
        if command in {"START", "START_PAPER", "START_LIVE"}:
            return "Running"
        if command == "PAUSE":
            return "Paused"
        if command == "STOP":
            return "Stopped"
        return current_status

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()
