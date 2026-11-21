import assert from "node:assert/strict";
import test from "node:test";
import { requireRole } from "../lib/authorization.ts";
import { companyDashboardQueries } from "../lib/company-representative.ts";

test("CompanyRep authorization accepts only CompanyRep sessions", () => {
  const companyRep = {
    userId: 7,
    username: "representative",
    role: "CompanyRep" as const,
  };

  assert.equal(requireRole(companyRep, ["CompanyRep"]), companyRep);
  assert.throws(() => requireRole(null, ["CompanyRep"]), /Forbidden/);
  assert.throws(
    () =>
      requireRole(
        { userId: 8, username: "student", role: "Student" },
        ["CompanyRep"]
      ),
    /Forbidden/
  );
  assert.throws(
    () =>
      requireRole(
        { userId: 9, username: "admin", role: "Admin" },
        ["CompanyRep"]
      ),
    /Forbidden/
  );
});

test("dashboard queries scope both reads to the authenticated representative", () => {
  const userId = 71;
  const queries = companyDashboardQueries(userId);

  assert.deepEqual(queries.opportunities.values, [userId]);
  assert.match(queries.opportunities.text, /WHERE rep\.user_id = \$1/);
  assert.deepEqual(queries.applications.values, [userId]);
  assert.match(queries.applications.text, /rep\.company_id = opportunity\.company_id/);
  assert.match(queries.applications.text, /WHERE rep\.user_id = \$1/);
  assert.doesNotMatch(queries.applications.text, /resume_url/i);

  const otherRepresentativeQueries = companyDashboardQueries(userId + 1);
  assert.deepEqual(otherRepresentativeQueries.opportunities.values, [userId + 1]);
  assert.deepEqual(otherRepresentativeQueries.applications.values, [userId + 1]);
});
