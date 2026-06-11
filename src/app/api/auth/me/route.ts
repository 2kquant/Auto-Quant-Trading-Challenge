import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "로그인 안됨" }, { status: 401 });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);

    return NextResponse.json({
      user: decoded,
    });
  } catch (err) {
    return NextResponse.json({ error: "토큰 에러" }, { status: 401 });
  }
}
