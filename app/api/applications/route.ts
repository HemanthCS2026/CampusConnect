import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionUser, requireRole } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2_147_483_647
  );
}

function hasDatabaseCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function getStudentSession(request: Request):
  | { user: AuthUser }
  | { response: NextResponse } {
  const sessionUser = getSessionUser(request);

  try {
    return { user: requireRole(sessionUser, ["Student"]) };
  } catch {
    return {
      response: NextResponse.json(
        { message: "Sign in as a student to access applications." },
        { status: sessionUser ? 403 : 401 }
      ),
    };
  }
}

async function findStudentId(userId: number): Promise<number | null> {
  const result = await pool.query(
    `SELECT student_id
     FROM students
     WHERE user_id = $1`,
    [userId]
  );
  const studentId = result.rows[0]?.student_id;
  return typeof studentId === "number" && Number.isInteger(studentId)
    ? studentId
    : null;
}

export async function GET(request: Request) {
  const session = getStudentSession(request);
  if ("response" in session) return session.response;

  try {
    const studentId = await findStudentId(session.user.userId);
    if (studentId === null) {
      return NextResponse.json(
        { message: "Student profile not found." },
        { status: 404 }
      );
    }

    const result = await pool.query(
      `SELECT
         a.app_id,
         a.student_id,
         concat_ws(' ', s.first_name, s.last_name) AS student_name,
         a.opp_id,
         o.title AS opportunity_title,
         c.company_name,
         a.applied_date::text AS applied_date,
         a.status,
         a.resume_url
       FROM applications AS a
       JOIN students AS s
         ON s.student_id = a.student_id
       JOIN opportunities AS o
         ON o.opp_id = a.opp_id
       JOIN companies AS c
         ON c.company_id = o.company_id
       WHERE a.student_id = $1
       ORDER BY a.applied_date DESC, a.app_id DESC`,
      [studentId]
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      applications: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch applications:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch applications." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = getStudentSession(request);
  if ("response" in session) return session.response;

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { message: "Cross-origin application requests are not allowed." },
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

  if (!isRecord(body)) {
    return NextResponse.json(
      { message: "Request body must be a JSON object." },
      { status: 400 }
    );
  }

  const { student_id, opp_id, resume_url } = body;

  if (
    (student_id !== undefined && !isPositiveInteger(student_id)) ||
    !isPositiveInteger(opp_id)
  ) {
    return NextResponse.json(
      { message: "opp_id and any supplied student_id must be positive integers." },
      { status: 400 }
    );
  }

  if (
    resume_url !== undefined &&
    resume_url !== null &&
    typeof resume_url !== "string"
  ) {
    return NextResponse.json(
      { message: "resume_url must be a string or null." },
      { status: 400 }
    );
  }

  try {
    const studentId = await findStudentId(session.user.userId);
    if (studentId === null) {
      return NextResponse.json(
        { message: "Student profile not found." },
        { status: 404 }
      );
    }

    if (student_id !== undefined && student_id !== studentId) {
      return NextResponse.json(
        { message: "Applications can only be submitted for your own student profile." },
        { status: 403 }
      );
    }

    const result = await pool.query(
      `INSERT INTO applications (student_id, opp_id, resume_url)
       VALUES ($1, $2, $3)
       RETURNING app_id, student_id, opp_id, applied_date, status, resume_url`,
      [studentId, opp_id, resume_url ?? null]
    );

    return NextResponse.json(
      { application: result.rows[0] },
      { status: 201 }
    );
  } catch (error) {
    if (hasDatabaseCode(error, "23505")) {
      return NextResponse.json(
        { message: "You have already applied to this opportunity." },
        { status: 409 }
      );
    }

    if (hasDatabaseCode(error, "23503")) {
      return NextResponse.json(
        { message: "The selected student or opportunity does not exist." },
        { status: 400 }
      );
    }

    console.error("Failed to create application:", error);
    return NextResponse.json(
      { message: "Failed to submit application." },
      { status: 500 }
    );
  }
}