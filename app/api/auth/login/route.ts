import { NextResponse } from "next/server";
import {
  createSessionToken,
  findUserByUsername,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { getDatabaseErrorCode } from "@/lib/database-error-code";
import { readBoundedJsonBody } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";

const MAX_AUTH_REQUEST_BYTES = 16_384;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Cross-origin authentication requests are not allowed." },
      { status: 403 }
    );
  }

  const parsedBody = await readBoundedJsonBody(request, MAX_AUTH_REQUEST_BYTES);
  if (!parsedBody.ok) {
    const tooLarge = parsedBody.reason === "too-large";
    return NextResponse.json(
      {
        message: tooLarge
          ? "Request body is too large."
          : "Request body must be valid JSON.",
      },
      { status: tooLarge ? 413 : 400 }
    );
  }
  const body = parsedBody.value;

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
  } catch (error) {
    console.error("Login failed.", {
      sqlState: getDatabaseErrorCode(error),
    });
    return NextResponse.json(
      { success: false, message: "Login failed." },
      { status: 500 }
    );
  }
}
