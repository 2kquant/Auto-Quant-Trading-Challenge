import { NextResponse } from "next/server";
import { sendTelegram } from "@/lib/telegram";

export async function GET() {
  await sendTelegram("✅ 텔레그램 연동 성공");

  return NextResponse.json({
    success: true,
  });
}
