import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getDatabaseErrorCode } from "@/lib/database-error-code";

export async function GET() {
  try {
    await pool.query("SELECT 1");

    return NextResponse.json({
      success: true,
      message: "Database connection is healthy.",
    });
  } catch (error) {
    console.error("Database health check failed.", {
      sqlState: getDatabaseErrorCode(error),
    });

    return NextResponse.json(
      {
        success: false,
        message: "Database connection is unavailable.",
      },
      { status: 503 }
    );
  }
}
