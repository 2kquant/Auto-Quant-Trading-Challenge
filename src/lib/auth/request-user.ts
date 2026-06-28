import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

type JwtPayload = {
  id?: string;
  userId?: string;
  email?: string;
};

export function getRequestUserId(req: NextRequest) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cookieToken = req.cookies.get("token")?.value;
  const token = authToken || cookieToken;

  if (!token) return null;

  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

  return decoded.id || decoded.userId || null;
}

export function isTelegramAdmin(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_ADMIN_SECRET;
  const providedSecret = req.headers.get("x-telegram-admin-secret");

  return Boolean(expectedSecret && providedSecret && providedSecret === expectedSecret);
}
