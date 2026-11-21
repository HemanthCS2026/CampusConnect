"use client";

import { useEffect, useState } from "react";

type Opportunity = {
  opp_id: number;
  title: string;
  type: string;
  salary: string | number | null;
  deadline: string;
  min_gpa: string | number | null;
};

type Application = {
  app_id: number;
  student_name: string;
  department_name: string;
  gpa: string;
  graduation_year: number;
  opportunity_title: string;
  applied_date: string;
  status: string;
};

type Dashboard = {
  companyName: string;
  opportunities: Opportunity[];
  applications: Application[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberOrStringOrNull(
  value: unknown
): value is string | number | null {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isOpportunity(value: unknown): value is Opportunity {
  return (
    isRecord(value) &&
    typeof value.opp_id === "number" &&
    Number.isSafeInteger(value.opp_id) &&
    value.opp_id > 0 &&
    typeof value.title === "string" &&
    typeof value.type === "string" &&
    isNumberOrStringOrNull(value.salary) &&
    typeof value.deadline === "string" &&
    isNumberOrStringOrNull(value.min_gpa)
  );
}

function isApplication(value: unknown): value is Application {
  return (
    isRecord(value) &&
    typeof value.app_id === "number" &&
    Number.isSafeInteger(value.app_id) &&
    value.app_id > 0 &&
    typeof value.student_name === "string" &&
    typeof value.department_name === "string" &&
    typeof value.gpa === "string" &&
    typeof value.graduation_year === "number" &&
    Number.isInteger(value.graduation_year) &&
    typeof value.opportunity_title === "string" &&
    typeof value.applied_date === "string" &&
    typeof value.status === "string"
  );
}

function isDashboard(value: unknown): value is Dashboard {
  return (
    isRecord(value) &&
    typeof value.companyName === "string" &&
    Array.isArray(value.opportunities) &&
    value.opportunities.every(isOpportunity) &&
    Array.isArray(value.applications) &&
    value.applications.every(isApplication)
  );
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Date unavailable";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatAmount(value: string | number | null): string {
  if (value === null || value === "") return "Not specified";
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("en-IN") : "Not specified";
}

export default function CompanyRepresentativeDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/company/dashboard", { signal: controller.signal })
      .then(async (response) => {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw new Error("The company dashboard returned invalid data.");
        }

        if (!response.ok) {
          throw new Error(
            isRecord(data) && typeof data.message === "string"
              ? data.message
              : "Could not load company dashboard data."
          );
        }
        if (!isDashboard(data)) {
          throw new Error("The company dashboard returned an unexpected response.");
        }
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setDashboard(data);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load company dashboard data."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshToken]);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">
          Company representative
        </p>
        <h2 className="mt-2 text-3xl font-bold">
          {dashboard?.companyName ?? "Company Dashboard"}
        </h2>
        <p className="mt-2 text-slate-600">
          Opportunities and applications linked to your company account.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Opportunities</p>
          <p className="mt-2 text-3xl font-bold">
            {loading ? "Loading" : dashboard?.opportunities.length ?? "Unavailable"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Opportunities owned by your linked company
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Applications</p>
          <p className="mt-2 text-3xl font-bold">
            {loading ? "Loading" : dashboard?.applications.length ?? "Unavailable"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Applications for your company&apos;s opportunities
          </p>
        </article>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Company Opportunities</h2>
            <p className="mt-2 text-sm text-slate-600">
              This view is limited to the company linked to your authenticated
              representative account.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setError("");
              setRefreshToken((current) => current + 1);
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:text-slate-400"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading && (
          <p role="status" className="mt-4 text-slate-600">
            Loading company opportunities and applications...
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 p-4 text-red-700">
            {error}
          </p>
        )}
        {!loading && !error && dashboard?.opportunities.length === 0 && (
          <p role="status" className="mt-4 text-slate-600">
            No opportunities are linked to this company.
          </p>
        )}
        {!loading && !error && dashboard?.opportunities.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {dashboard.opportunities.map((opportunity) => (
              <article
                key={opportunity.opp_id}
                className="rounded-xl border border-slate-200 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{opportunity.title}</h3>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {opportunity.type}
                  </span>
                </div>
                <div className="mt-4 space-y-1 text-sm text-slate-600">
                  <p>Salary / stipend: ₹{formatAmount(opportunity.salary)}</p>
                  <p>Minimum GPA: {formatAmount(opportunity.min_gpa)}</p>
                  <p>Deadline: {formatDate(opportunity.deadline)}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Applications</h2>
        <p className="mt-2 text-sm text-slate-600">
          Applicant details are shown only for applications to this company&apos;s
          opportunities. Resume URLs and account identifiers are not returned.
        </p>
        {!loading && !error && dashboard?.applications.length === 0 && (
          <p role="status" className="mt-4 text-slate-600">
            No applications have been submitted to this company&apos;s opportunities.
          </p>
        )}
        {!loading && !error && dashboard?.applications.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th scope="col" className="px-3 py-3 font-semibold">Student</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Department</th>
                  <th scope="col" className="px-3 py-3 font-semibold">GPA</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Graduation</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Opportunity</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Applied</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.applications.map((application) => (
                  <tr
                    key={application.app_id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-3 font-medium">
                      {application.student_name || "Name unavailable"}
                    </td>
                    <td className="px-3 py-3">{application.department_name}</td>
                    <td className="px-3 py-3">{application.gpa}</td>
                    <td className="px-3 py-3">{application.graduation_year}</td>
                    <td className="px-3 py-3">{application.opportunity_title}</td>
                    <td className="px-3 py-3">
                      {formatDate(application.applied_date)}
                    </td>
                    <td className="px-3 py-3">{application.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
