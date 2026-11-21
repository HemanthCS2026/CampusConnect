import { NextResponse } from "next/server";
import {
  createSessionToken,
  findUserByUsername,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Cross-origin authentication requests are not allowed." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { message: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { message: "Username and password are required." },
      { status: 400 }
    );
  }

  try {
    const user = await findUserByUsername(username.trim());
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json(
        { message: "Invalid username or password." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: {
        userId: user.user_id,
        username: user.username,
        role: user.role,
      },
    });
    response.cookies.set(
      SESSION_COOKIE,
      createSessionToken({
        userId: user.user_id,
        username: user.username,
        role: user.role,
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 8 * 60 * 60,
      }
    );
    return response;
  } catch {
    console.error("Login failed.");
    return NextResponse.json(
      { success: false, message: "Login failed." },
      { status: 500 }
    );
  }
}
