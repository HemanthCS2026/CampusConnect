
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getDatabaseErrorCode } from "@/lib/database-error-code";
import { getSessionUser, requireRole } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

export async function GET(request: Request) {
  const sessionUser = getSessionUser(request);

  let studentUser: AuthUser;
  try {
    studentUser = requireRole(sessionUser, ["Student"]);
  } catch {
    return NextResponse.json(
      { message: "Sign in as a student to view your student profile." },
      { status: sessionUser ? 403 : 401 }
    );
  }

  try {
    const result = await pool.query(
      `
      SELECT student_id, user_id, first_name, last_name
      FROM students
      WHERE user_id = $1
      ORDER BY student_id
    `,
      [studentUser.userId]
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      students: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch students.", {
      sqlState: getDatabaseErrorCode(error),
    });

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch students",
      },
      { status: 500 }
    );
  }
}
