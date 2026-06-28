import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const SECRET = process.env.TELEGRAM_ADMIN_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL!;

async function telegram(method: string, body: unknown) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const message = update.message;
    const callback = update.callback_query;

    // ---------------- /start ----------------

    if (message?.text === "/start") {
      const chatId = String(message.chat.id);

      await telegram("sendMessage", {
        chat_id: chatId,
        text: "2K Quant Bot",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "▶ START",
                callback_data: "START",
              },
              {
                text: "⏸ PAUSE",
                callback_data: "PAUSE",
              },
            ],
            [
              {
                text: "⏹ STOP",
                callback_data: "STOP",
              },
              {
                text: "💰 MODE",
                callback_data: "MODE",
              },
            ],
            [
              {
                text: "📊 STATUS",
                callback_data: "STATUS",
              },
            ],
          ],
        },
      });

      return NextResponse.json({ ok: true });
    }

    // ---------------- 버튼 ----------------

    if (callback) {
      const command = callback.data;
      const chatId = String(callback.message.chat.id);

      if (command === "START" || command === "PAUSE" || command === "STOP") {
        await fetch(`${BASE_URL}/api/trading-control`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-admin-secret": SECRET,
          },
          body: JSON.stringify({
            command,
          }),
        });

        await telegram("answerCallbackQuery", {
          callback_query_id: callback.id,
        });

        await telegram("sendMessage", {
          chat_id: chatId,
          text: `✅ ${command} 완료`,
        });
      }

      if (command === "STATUS") {
        const res = await fetch(`${BASE_URL}/api/trading-control`, {
          headers: {
            "x-telegram-admin-secret": SECRET,
          },
        });

        const state = await res.json();

        await telegram("answerCallbackQuery", {
          callback_query_id: callback.id,
        });

        await telegram("sendMessage", {
          chat_id: chatId,
          text:
            `📊 상태\n\n` +
            `Status : ${state.status}\n` +
            `Last : ${state.lastCommand ?? "-"}\n` +
            `Updated : ${state.updatedAt}`,
        });
      }

      if (command === "MODE") {
        const res = await fetch(
          `${BASE_URL}/api/trading-mode?telegramChatId=${chatId}`,
          {
            headers: {
              "x-telegram-admin-secret": SECRET,
            },
          },
        );

        const mode = await res.json();

        await telegram("answerCallbackQuery", {
          callback_query_id: callback.id,
        });

        await telegram("sendMessage", {
          chat_id: chatId,
          text: `💰 Trading Mode : ${mode.mode}`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
