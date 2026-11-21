import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionUser, requireRole } from "@/lib/auth";

type AdminApplicationRow = {
  app_id: number;
  student_name: string;
  opportunity_title: string;
  company_name: string;
  applied_date: string | null;
  status: string | null;
};

const APPLICATIONS_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const sessionUser = getSessionUser(request);
  try {
    requireRole(sessionUser, ["Admin"]);
  } catch {
    return NextResponse.json(
      { success: false, message: "Administrator access required." },
      { status: sessionUser ? 403 : 401 }
    );
  }

  try {
    const [countResult, applicationsResult] = await Promise.all([
      pool.query<{ total_count: string }>(
        `SELECT COUNT(*)::text AS total_count
         FROM public.applications`
      ),
      pool.query<AdminApplicationRow>(
        `SELECT
           a.app_id,
           concat_ws(' ', s.first_name, s.last_name) AS student_name,
           o.title AS opportunity_title,
           c.company_name,
           a.applied_date::text AS applied_date,
           a.status
         FROM public.applications AS a
         JOIN public.students AS s
           ON s.student_id = a.student_id
         JOIN public.opportunities AS o
           ON o.opp_id = a.opp_id
         JOIN public.companies AS c
           ON c.company_id = o.company_id
         ORDER BY a.applied_date DESC, a.app_id DESC
         LIMIT ${APPLICATIONS_PAGE_SIZE}`
      ),
    ]);

    const totalCount = Number(countResult.rows[0]?.total_count);
    if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
      throw new Error("Application count is invalid.");
    }

    return NextResponse.json({
      success: true,
      totalCount,
      count: applicationsResult.rows.length,
      applications: applicationsResult.rows,
    });
  } catch {
    console.error("Failed to fetch admin applications.");
    return NextResponse.json(
      { success: false, message: "Failed to fetch applications." },
      { status: 500 }
    );
  }
}
