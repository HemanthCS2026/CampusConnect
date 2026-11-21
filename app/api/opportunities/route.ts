import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q");
  const query = rawQuery?.trim();

  if (
    query !== undefined &&
    query !== null &&
    (query.length > 200 || /[\u0000-\u001F\u007F]/.test(query))
  ) {
    return NextResponse.json(
      { success: false, message: "Search query is invalid." },
      { status: 400 }
    );
  }

  try {
    if (!query) {
      const result = await pool.query(`
        SELECT
          o.opp_id,
          o.company_id,
          c.company_name,
          o.title,
          o.type,
          o.salary,
          o.deadline,
          o.min_gpa
        FROM opportunities AS o
        JOIN companies AS c
          ON c.company_id = o.company_id
        ORDER BY o.opp_id;
      `);

      return NextResponse.json({
        success: true,
        count: result.rows.length,
        opportunities: result.rows,
      });
    }

    const result = await pool.query(
      `
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', $1) AS tsquery
      )
      SELECT
        o.opp_id,
        o.company_id,
        c.company_name,
        o.title,
        o.type,
        o.salary,
        o.deadline,
        o.min_gpa,
        ts_rank(
          setweight(to_tsvector('english', coalesce(o.title, '')), 'A')
          || setweight(to_tsvector('english', coalesce(c.company_name, '')), 'B')
          || setweight(to_tsvector('english', coalesce(c.industry, '')), 'B')
          || setweight(to_tsvector('english', coalesce(o.type, '')), 'C'),
          search_query.tsquery
        ) AS rank
      FROM opportunities AS o
      JOIN companies AS c
        ON c.company_id = o.company_id
      CROSS JOIN search_query
      WHERE search_query.tsquery <> ''::tsquery
        AND (
          to_tsvector(
            'english',
            coalesce(o.title, '') || ' ' || coalesce(o.type, '')
          ) @@ search_query.tsquery
          OR to_tsvector(
            'english',
            coalesce(c.company_name, '') || ' ' || coalesce(c.industry, '')
          ) @@ search_query.tsquery
        )
      ORDER BY rank DESC, o.deadline ASC, o.opp_id ASC
      LIMIT 100
      `,
      [query]
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      opportunities: result.rows.map((row) => ({
        opp_id: row.opp_id,
        company_id: row.company_id,
        company_name: row.company_name,
        title: row.title,
        type: row.type,
        salary: row.salary,
        deadline: row.deadline,
        min_gpa: row.min_gpa,
      })),
      ranks: Object.fromEntries(
        result.rows.map((row) => [row.opp_id, Number(row.rank)])
      ),
    });
  } catch {
    console.error("Failed to fetch opportunities.");

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch opportunities.",
      },
      { status: 500 }
    );
  }
}
