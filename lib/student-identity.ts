import pool from "@/lib/db";

export type StudentIdentity = {
  studentId: number;
  gpa: number;
};

export async function findStudentIdentity(
  userId: number
): Promise<StudentIdentity | null> {
  const result = await pool.query(
    `SELECT student_id, gpa
     FROM public.students
     WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const studentId = Number(row.student_id);
  const gpa = Number(row.gpa);
  if (
    !Number.isInteger(studentId) ||
    studentId < 1 ||
    studentId > 2_147_483_647 ||
    !Number.isFinite(gpa)
  ) {
    throw new Error("Student identity data is invalid.");
  }

  return { studentId, gpa };
}
