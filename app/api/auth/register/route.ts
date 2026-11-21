import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getDatabaseErrorCode } from "@/lib/database-error-code";
import { validatePersonName, validateUsername } from "@/lib/input-validation";
import { readBoundedJsonBody } from "@/lib/request-body";
import { isSameOriginRequest } from "@/lib/request-security";

const MAX_AUTH_REQUEST_BYTES = 16_384;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Cross-origin registration requests are not allowed." },
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
  const normalizedUsername = validateUsername(username);
  if (!normalizedUsername.ok) {
    return NextResponse.json(
      { message: normalizedUsername.message },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      {
        message: "Password must contain at least 8 characters.",
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

  const normalizedFirstName = validatePersonName(firstName);
  const normalizedLastName = validatePersonName(lastName);
  if (!normalizedFirstName.ok || !normalizedLastName.ok) {
    return NextResponse.json(
      {
        message:
          "First and last names must each contain 1 to 50 characters after trimming.",
      },
      { status: 400 }
    );
  }

  if (
    !Number.isInteger(deptId) ||
    (deptId as number) <= 0 ||
    (deptId as number) > 2_147_483_647 ||
    typeof gpa !== "number" ||
    gpa < 0 ||
    gpa > 10 ||
    !Number.isInteger(graduationYear) ||
    (graduationYear as number) < 2000 ||
    (graduationYear as number) > 2_147_483_647
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
        [normalizedUsername.value, passwordHash, role]
      );
      await client.query(
        `INSERT INTO students
           (user_id, dept_id, first_name, last_name, gpa, graduation_year)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          result.rows[0].user_id,
          deptId,
          normalizedFirstName.value,
          normalizedLastName.value,
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
      getDatabaseErrorCode(error) === "23505"
    ) {
      return NextResponse.json(
        { message: "Username is already registered." },
        { status: 409 }
      );
    }
    if (getDatabaseErrorCode(error) === "23503") {
      return NextResponse.json(
        { message: "The selected department is invalid." },
        { status: 400 }
      );
    }
    console.error("Registration failed.", {
      sqlState: getDatabaseErrorCode(error),
    });
    return NextResponse.json(
      { success: false, message: "Registration failed." },
      { status: 500 }
    );
  }
}
