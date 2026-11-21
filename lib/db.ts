
import "server-only";

import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "placement_management",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD,
});

export default pool;
