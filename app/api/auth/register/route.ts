import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Cross-origin registration requests are not allowed." },
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

  const {
    username,
    password,
    role,
    firstName,
    lastName,
    deptId,
    gpa,
    graduationYear,
  } = body as Record<string, unknown>;
  if (
    typeof username !== "string" ||
    username.trim().length < 3 ||
    typeof password !== "string" ||
    password.length < 8
  ) {
    return NextResponse.json(
      {
        message:
          "Username must have 3+ characters and password 8+ characters.",
      },
      { status: 400 }
    );
  }
  if (role !== "Student") {
    return NextResponse.json(
      { message: "Public registration is available only for students." },
      { status: 403 }
    );
  }

  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    !Number.isInteger(deptId) ||
    (deptId as number) <= 0 ||
    typeof gpa !== "number" ||
    gpa < 0 ||
    gpa > 10 ||
    !Number.isInteger(graduationYear) ||
    (graduationYear as number) < 2000
  ) {
    return NextResponse.json(
      {
        message:
          "Student name, department, GPA, and graduation year are required.",
      },
      { status: 400 }
    );
  }

  try {
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");
      result = await client.query(
        `INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, $3)
         RETURNING user_id, username, role`,
        [username.trim(), passwordHash, role]
      );
      await client.query(
        `INSERT INTO students
           (user_id, dept_id, first_name, last_name, gpa, graduation_year)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          result.rows[0].user_id,
          deptId,
          firstName.trim(),
          lastName.trim(),
          gpa,
          graduationYear,
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return NextResponse.json(
      { success: true, user: result.rows[0] },
      { status: 201 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { message: "Username is already registered." },
        { status: 409 }
      );
    }
    console.error("Registration failed.");
    return NextResponse.json(
      { success: false, message: "Registration failed." },
      { status: 500 }
    );
  }
}
