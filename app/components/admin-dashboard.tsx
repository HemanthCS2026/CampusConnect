"use client";

import { useCallback, useEffect, useState } from "react";

type Opportunity = {
  opp_id: number;
  company_name: string;
  title: string;
  type: string;
  salary: string | number | null;
  deadline: string;
  min_gpa: string | number | null;
};

type Application = {
  app_id: number;
  student_name: string;
  opportunity_title: string;
  company_name: string;
  applied_date: string | null;
  status: string | null;
};

type SkillProficiency = {
  skill: string;
  proficiency: string;
  studentCount: number;
};

type EmbeddingResult = {
  success: true;
  model: string;
  revision: string;
  examined: number;
  generated: number;
  unchanged: number;
};

type Feedback = {
  kind: "success" | "error";
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
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
    isNonNegativeSafeInteger(value.opp_id) &&
    value.opp_id > 0 &&
    typeof value.company_name === "string" &&
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
    isNonNegativeSafeInteger(value.app_id) &&
    value.app_id > 0 &&
    typeof value.student_name === "string" &&
    typeof value.opportunity_title === "string" &&
    typeof value.company_name === "string" &&
    (typeof value.applied_date === "string" || value.applied_date === null) &&
    (typeof value.status === "string" || value.status === null)
  );
}

function isSkillProficiency(value: unknown): value is SkillProficiency {
  return (
    isRecord(value) &&
    typeof value.skill === "string" &&
    typeof value.proficiency === "string" &&
    isNonNegativeSafeInteger(value.studentCount)
  );
}

function errorMessage(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.message === "string"
    ? data.message
    : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) return "Date unavailable";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function displayNumber(value: string | number | null): string {
  if (value === null || value === "") return "Not specified";
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString("en-IN")
    : "Not specified";
}

function OverviewCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </article>
  );
}

export default function AdminDashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(true);
  const [opportunitiesError, setOpportunitiesError] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [totalApplications, setTotalApplications] = useState<number | null>(
    null
  );
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState("");
  const [skills, setSkills] = useState<SkillProficiency[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState("");
  const [regeneratingEmbeddings, setRegeneratingEmbeddings] = useState(false);
  const [embeddingFeedback, setEmbeddingFeedback] = useState<Feedback | null>(
    null
  );

  const loadOpportunities = useCallback((signal?: AbortSignal) => {
    void fetch("/api/opportunities", { signal })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) {
          throw new Error(errorMessage(data, "Could not load opportunities."));
        }
        return data;
      })
      .then((data) => {
        if (signal?.aborted) return;
        if (
          !isRecord(data) ||
          data.success !== true ||
          !Array.isArray(data.opportunities) ||
          !data.opportunities.every(isOpportunity)
        ) {
          throw new Error(errorMessage(data, "Could not load opportunities."));
        }
        setOpportunities(data.opportunities);
      })
      .catch((error: unknown) => {
        if (signal?.aborted) return;
        setOpportunitiesError(
          error instanceof Error
            ? error.message
            : "Could not load opportunities."
        );
      })
      .finally(() => {
        if (!signal?.aborted) setOpportunitiesLoading(false);
      });
  }, []);

  const loadApplications = useCallback((signal?: AbortSignal) => {
    void fetch("/api/admin/applications", { signal })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) {
          throw new Error(errorMessage(data, "Could not load applications."));
        }
        return data;
      })
      .then((data) => {
        if (signal?.aborted) return;
        if (
          !isRecord(data) ||
          data.success !== true ||
          !isNonNegativeSafeInteger(data.totalCount) ||
          !Array.isArray(data.applications) ||
          !data.applications.every(isApplication)
        ) {
          throw new Error(errorMessage(data, "Could not load applications."));
        }
        setApplications(data.applications);
        setTotalApplications(data.totalCount);
      })
      .catch((error: unknown) => {
        if (signal?.aborted) return;
        setApplicationsError(
          error instanceof Error ? error.message : "Could not load applications."
        );
      })
      .finally(() => {
        if (!signal?.aborted) setApplicationsLoading(false);
      });
  }, []);

  const loadSkills = useCallback((signal?: AbortSignal) => {
    void fetch("/api/analytics/skill-proficiency", { signal })
      .then(async (response) => {
        const data = await readJson(response);
        if (!response.ok) {
          throw new Error(errorMessage(data, "Could not load skill analytics."));
        }
        return data;
      })
      .then((data) => {
        if (signal?.aborted) return;
        if (
          !isRecord(data) ||
          data.success !== true ||
          !Array.isArray(data.results) ||
          !data.results.every(isSkillProficiency)
        ) {
          throw new Error(errorMessage(data, "Could not load skill analytics."));
        }
        setSkills(data.results);
      })
      .catch((error: unknown) => {
        if (signal?.aborted) return;
        setSkillsError(
          error instanceof Error
            ? error.message
            : "Could not load skill analytics."
        );
      })
      .finally(() => {
        if (!signal?.aborted) setSkillsLoading(false);
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadOpportunities(controller.signal);
    void loadApplications(controller.signal);
    void loadSkills(controller.signal);
    return () => controller.abort();
  }, [loadApplications, loadOpportunities, loadSkills]);

  async function regenerateEmbeddings() {
    setRegeneratingEmbeddings(true);
    setEmbeddingFeedback(null);
    try {
      const response = await fetch("/api/admin/semantic-embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await readJson(response);
      if (
        !response.ok ||
        !isRecord(data) ||
        data.success !== true ||
        typeof data.model !== "string" ||
        typeof data.revision !== "string" ||
        !isNonNegativeSafeInteger(data.examined) ||
        !isNonNegativeSafeInteger(data.generated) ||
        !isNonNegativeSafeInteger(data.unchanged)
      ) {
        throw new Error(
          errorMessage(data, "Could not regenerate semantic embeddings.")
        );
      }

      const result: EmbeddingResult = {
        success: true,
        model: data.model,
        revision: data.revision,
        examined: data.examined,
        generated: data.generated,
        unchanged: data.unchanged,
      };
      setEmbeddingFeedback({
        kind: "success",
        text: `Checked ${result.examined} opportunities: regenerated ${result.generated}; ${result.unchanged} unchanged (${result.model}, ${result.revision}).`,
      });
    } catch (error) {
      setEmbeddingFeedback({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not regenerate semantic embeddings.",
      });
    } finally {
      setRegeneratingEmbeddings(false);
    }
  }

  const distinctSkillCount = new Set(skills.map((row) => row.skill)).size;

  return (
    <div className="space-y-8">
      <section aria-labelledby="admin-dashboard-heading">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">
          Administration
        </p>
        <h2 id="admin-dashboard-heading" className="mt-2 text-3xl font-bold">
          Admin Dashboard
        </h2>
        <p className="mt-2 text-slate-600">
          Read-only placement overview, application activity, and skill
          analytics.
        </p>
      </section>

      <section aria-labelledby="admin-overview-heading">
        <h2 id="admin-overview-heading" className="mb-4 text-2xl font-semibold">
          Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OverviewCard
            label="Opportunities"
            value={
              opportunitiesLoading
                ? "Loading"
                : opportunitiesError
                  ? "Unavailable"
                  : String(opportunities.length)
            }
            detail="Records returned by the opportunities API"
          />
          <OverviewCard
            label="Applications"
            value={
              applicationsLoading
                ? "Loading"
                : applicationsError || totalApplications === null
                  ? "Unavailable"
                  : String(totalApplications)
            }
            detail="Total application records"
          />
          <OverviewCard
            label="Skill analytics"
            value={
              skillsLoading
                ? "Loading"
                : skillsError
                  ? "Unavailable"
                  : String(distinctSkillCount)
            }
            detail="Distinct skills in returned analytics"
          />
          <OverviewCard
            label="Student totals"
            value="Unavailable"
            detail="No Admin student-count API is currently available"
          />
        </div>
      </section>

      <section
        aria-labelledby="admin-opportunities-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="admin-opportunities-heading"
              className="text-2xl font-semibold"
            >
              Opportunities
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Current opportunity records. Management actions are not exposed
              by the existing Admin APIs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpportunitiesLoading(true);
              setOpportunitiesError("");
              void loadOpportunities();
            }}
            disabled={opportunitiesLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:text-slate-400"
          >
            {opportunitiesLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {opportunitiesError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 p-4 text-red-700">
            {opportunitiesError}
          </p>
        )}
        {opportunitiesLoading ? (
          <p role="status" className="mt-4 text-slate-600">
            Loading opportunities...
          </p>
        ) : !opportunitiesError && opportunities.length === 0 ? (
          <p role="status" className="mt-4 text-slate-600">
            No opportunities were returned.
          </p>
        ) : (
          !opportunitiesError && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {opportunities.map((opportunity) => (
                <article
                  key={opportunity.opp_id}
                  className="rounded-xl border border-slate-200 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {opportunity.title}
                      </h3>
                      <p className="mt-1 text-sm font-medium text-blue-700">
                        {opportunity.company_name}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      {opportunity.type}
                    </span>
                  </div>
                  <div className="mt-4 space-y-1 text-sm text-slate-600">
                    <p>Salary / stipend: ₹{displayNumber(opportunity.salary)}</p>
                    <p>Minimum GPA: {displayNumber(opportunity.min_gpa)}</p>
                    <p>Deadline: {formatDate(opportunity.deadline)}</p>
                  </div>
                </article>
              ))}
            </div>
          )
        )}
      </section>

      <section
        aria-labelledby="admin-applications-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="admin-applications-heading"
              className="text-2xl font-semibold"
            >
              Applications
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Latest applications with their current status.
              {totalApplications !== null &&
                ` Showing ${applications.length} of ${totalApplications}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setApplicationsLoading(true);
              setApplicationsError("");
              void loadApplications();
            }}
            disabled={applicationsLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:text-slate-400"
          >
            {applicationsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {applicationsError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-100 p-4 text-red-700">
            {applicationsError}
          </p>
        )}
        {applicationsLoading ? (
          <p role="status" className="mt-4 text-slate-600">
            Loading applications...
          </p>
        ) : !applicationsError && applications.length === 0 ? (
          <p role="status" className="mt-4 text-slate-600">
            No applications were returned.
          </p>
        ) : (
          !applicationsError && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Student
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Opportunity
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Company
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Applied
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr
                      key={application.app_id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-3 font-medium">
                        {application.student_name || "Name unavailable"}
                      </td>
                      <td className="px-3 py-3">
                        {application.opportunity_title}
                      </td>
                      <td className="px-3 py-3">{application.company_name}</td>
                      <td className="px-3 py-3">
                        {formatDate(application.applied_date)}
                      </td>
                      <td className="px-3 py-3">
                        {application.status || "Unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      <section
        aria-labelledby="admin-skills-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="admin-skills-heading" className="text-2xl font-semibold">
              Skill Analytics
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Aggregated skill proficiency from the existing MongoDB analytics
              endpoint. No student-level profile data is displayed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSkillsLoading(true);
              setSkillsError("");
              void loadSkills();
            }}
            disabled={skillsLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:text-slate-400"
          >
            {skillsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {skillsError && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900">
            Skill analytics are unavailable: {skillsError}
          </p>
        )}
        {skillsLoading ? (
          <p role="status" className="mt-4 text-slate-600">
            Loading skill analytics...
          </p>
        ) : !skillsError && skills.length === 0 ? (
          <p role="status" className="mt-4 text-slate-600">
            The analytics endpoint returned no skill proficiency records.
          </p>
        ) : (
          !skillsError && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Skill
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Proficiency
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Student profiles
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((item, index) => (
                    <tr
                      key={`${item.skill}-${item.proficiency}-${index}`}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-3 font-medium">{item.skill}</td>
                      <td className="px-3 py-3">{item.proficiency}</td>
                      <td className="px-3 py-3">{item.studentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      <section
        aria-labelledby="admin-semantic-tools-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2
          id="admin-semantic-tools-heading"
          className="text-2xl font-semibold"
        >
          Semantic Embeddings
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Check existing opportunity sources and regenerate embeddings only
          when the source content or configured model revision is stale. This
          action writes embedding records; it never runs automatically.
        </p>
        <button
          type="button"
          onClick={() => void regenerateEmbeddings()}
          disabled={regeneratingEmbeddings}
          className="mt-4 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {regeneratingEmbeddings
            ? "Checking and regenerating..."
            : "Regenerate stale embeddings"}
        </button>
        {regeneratingEmbeddings && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            Comparing opportunity content with stored embedding metadata...
          </p>
        )}
        {embeddingFeedback && (
          <p
            role={embeddingFeedback.kind === "error" ? "alert" : "status"}
            className={`mt-4 rounded-lg p-4 ${
              embeddingFeedback.kind === "success"
                ? "bg-green-50 text-green-800"
                : "bg-red-100 text-red-700"
            }`}
          >
            {embeddingFeedback.text}
          </p>
        )}
      </section>
    </div>
  );
}
