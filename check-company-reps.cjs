/* eslint-disable @typescript-eslint/no-require-imports */
process.loadEnvFile?.(".env.local");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "placement_management",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD,
});

pool.query(`
  SELECT u.user_id, u.username, u.role, cr.rep_id, cr.company_id, c.company_name
  FROM users u
  LEFT JOIN company_reps cr ON cr.user_id = u.user_id
  LEFT JOIN companies c ON c.company_id = cr.company_id
  WHERE u.role = 'CompanyRep'
  ORDER BY u.user_id
`).then(({ rows }) => {
  console.table(rows);
}).catch(error => {
  console.error("Database query failed:", error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
