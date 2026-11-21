import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionUser, requireRole } from "@/lib/auth";
import {
  companyDashboardQueries,
} from "@/lib/company-representative";

type CompanyOpportunityRow = {
  company_id: number;
  company_name: string;
  opp_id: number | null;
  title: string | null;
  type: string | null;
  salary: string | number | null;
  deadline: string | null;
  min_gpa: string | number | null;
};

type CompanyApplicationRow = {
  app_id: number;
  student_name: string;
  department_name: string;
  gpa: string;
  graduation_year: number;
  opportunity_title: string;
  applied_date: string;
  status: string;
};

export async function GET(request: Request) {
  const sessionUser = getSessionUser(request);
  let companyRep;
  try {
    companyRep = requireRole(sessionUser, ["CompanyRep"]);
  } catch {
    return NextResponse.json(
      { success: false, message: "Company representative access required." },
      { status: sessionUser ? 403 : 401 }
    );
  }

  if (!Number.isSafeInteger(companyRep.userId) || companyRep.userId < 1) {
    return NextResponse.json(
      { success: false, message: "The signed-in account is invalid." },
      { status: 401 }
    );
  }

  const queries = companyDashboardQueries(companyRep.userId);

  try {
    const [opportunitiesResult, applicationsResult] = await Promise.all([
      pool.query<CompanyOpportunityRow>(
        queries.opportunities.text,
        queries.opportunities.values
      ),
      pool.query<CompanyApplicationRow>(
        queries.applications.text,
        queries.applications.values
      ),
    ]);

    const company = opportunitiesResult.rows[0];
    if (!company) {
      return NextResponse.json(
        {
          success: false,
          message: "No company profile is linked to this representative account.",
        },
        { status: 404 }
      );
    }

    const opportunities = opportunitiesResult.rows
      .filter(
        (
          row
        ): row is CompanyOpportunityRow & {
          opp_id: number;
          title: string;
          type: string;
          deadline: string;
        } =>
          row.opp_id !== null &&
          row.title !== null &&
          row.type !== null &&
          row.deadline !== null
      )
      .map((row) => ({
        opp_id: row.opp_id,
        title: row.title,
        type: row.type,
        salary: row.salary,
        deadline: row.deadline,
        min_gpa: row.min_gpa,
      }));

    return NextResponse.json({
      success: true,
      companyName: company.company_name,
      opportunities,
      applications: applicationsResult.rows,
    });
  } catch {
    console.error("Failed to load company representative dashboard.");
    return NextResponse.json(
      { success: false, message: "Failed to load company dashboard data." },
      { status: 500 }
    );
  }
}
