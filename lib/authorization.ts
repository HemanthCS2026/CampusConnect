export type UserRole = "Student" | "CompanyRep" | "Admin";

export type AuthUser = {
  userId: number;
  username: string;
  role: UserRole;
};

export function requireRole(user: AuthUser | null, roles: UserRole[]): AuthUser {
  if (!user || !roles.includes(user.role)) {
    throw new Error("Forbidden");
  }
  return user;
}
