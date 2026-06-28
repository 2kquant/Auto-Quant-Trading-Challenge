import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

type TradingStatus = "Running" | "Paused" | "Stopped";
type TradingCommand =
  | "START"
  | "START_PAPER"
  | "START_LIVE"
  | "PAUSE"
  | "STOP"
  | "CLOSE_ALL";

type JwtPayload = {
  id?: string;
  userId?: string;
  email?: string;
};

type TradingState = {
  status: TradingStatus;
  lastCommand: TradingCommand | null;
  commandId: number;
  updatedAt: string;
};

const STATE_FILE = path.join(process.cwd(), ".trading-control-state.json");
const TELEGRAM_ADMIN_HEADER = "x-telegram-admin-secret";

function getUserId(req: NextRequest) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cookieToken = req.cookies.get("token")?.value;
  const token = authToken || cookieToken;

  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

  return decoded.id || decoded.userId || null;
}

function isTelegramAdmin(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_ADMIN_SECRET;
  const providedSecret = req.headers.get(TELEGRAM_ADMIN_HEADER);

  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
}

function getDefaultState(): TradingState {
  return {
    status: "Stopped",
    lastCommand: null,
    commandId: 0,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCommand(value: unknown): TradingCommand | null {
  const command = String(value || "").toUpperCase();

  if (
    command === "START" ||
    command === "START_PAPER" ||
    command === "START_LIVE" ||
    command === "PAUSE" ||
    command === "STOP" ||
    command === "CLOSE_ALL"
  ) {
    return command;
  }

  return null;
}

function statusForCommand(
  command: TradingCommand,
  currentStatus: TradingStatus,
): TradingStatus {
  if (command === "START" || command === "START_PAPER" || command === "START_LIVE") {
    return "Running";
  }
  if (command === "PAUSE") return "Paused";
  if (command === "STOP") return "Stopped";
  return currentStatus;
}

async function readState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TradingState>;
    const status = parsed.status;

    return {
      status:
        status === "Running" || status === "Paused" || status === "Stopped"
          ? status
          : "Stopped",
      lastCommand: parsed.lastCommand ?? null,
      commandId: Number(parsed.commandId || 0),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    } satisfies TradingState;
  } catch {
    return getDefaultState();
  }
}

async function writeState(state: TradingState) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const telegramAdmin = isTelegramAdmin(req);

    if (!userId && !telegramAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await readState());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trading state failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isTelegramAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { command?: string };
    const command = normalizeCommand(body.command);

    if (!command) {
      return NextResponse.json({ error: "Invalid command" }, { status: 400 });
    }

    const current = await readState();
    const next: TradingState = {
      status: statusForCommand(command, current.status),
      lastCommand: command,
      commandId: current.commandId + 1,
      updatedAt: new Date().toISOString(),
    };

    await writeState(next);

    return NextResponse.json(next);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trading control failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
