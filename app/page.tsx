"use client";

import { useEffect, useRef, useState } from "react";
import AdminDashboard from "./components/admin-dashboard";
import CompanyRepresentativeDashboard from "./components/company-representative-dashboard";

type Opportunity = {
  opp_id: number;
  company_id: number;
  company_name: string;
  title: string;
  type: string;
  salary: string;
  deadline: string;
  min_gpa: string;
};

type Student = {
  student_id: number;
  user_id: number;
  first_name: string;
  last_name: string;
};

type Application = {
  app_id: number;
  student_id: number;
  student_name: string;
  opp_id: number;
  opportunity_title: string;
  company_name: string;
  applied_date: string | null;
  status: string | null;
  resume_url: string | null;
};

type ApplicationMessage = {
  kind: "success" | "error" | "info";
  text: string;
};

type SemanticRecommendation = {
  opp_id: number;
  title: string;
  type: string;
  company_name: string;
  industry: string;
  deadline: string;
  similarity: number;
};

type SemanticRecommendationResponse = {
  success: true;
  mode: "semantic-embedding-cosine";
  model: string;
  revision: string;
  dimensions: number;
  profileFound: boolean;
  eligibleOpportunities?: number;
  embeddedOpportunities?: number;
  missingOpportunityEmbeddings?: number;
  count: number;
  recommendations: SemanticRecommendation[];
};

type AuthUser = {
  userId: number;
  username: string;
  role: "Student" | "CompanyRep" | "Admin";
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

function isSemanticRecommendation(
  value: unknown
): value is SemanticRecommendation {
  return (
    isRecord(value) &&
    typeof value.opp_id === "number" &&
    Number.isSafeInteger(value.opp_id) &&
    value.opp_id > 0 &&
    typeof value.title === "string" &&
    typeof value.type === "string" &&
    typeof value.company_name === "string" &&
    typeof value.industry === "string" &&
    typeof value.deadline === "string" &&
    typeof value.similarity === "number" &&
    Number.isFinite(value.similarity)
  );
}

function isSemanticRecommendationResponse(
  value: unknown
): value is SemanticRecommendationResponse {
  if (
    !isRecord(value) ||
    value.success !== true ||
    value.mode !== "semantic-embedding-cosine" ||
    typeof value.model !== "string" ||
    typeof value.revision !== "string" ||
    value.dimensions !== 384 ||
    typeof value.profileFound !== "boolean" ||
    !isNonNegativeSafeInteger(value.count) ||
    !Array.isArray(value.recommendations) ||
    !value.recommendations.every(isSemanticRecommendation)
  ) {
    return false;
  }

  return [
    value.eligibleOpportunities,
    value.embeddedOpportunities,
    value.missingOpportunityEmbeddings,
  ].every(
    (count) =>
      count === undefined ||
      isNonNegativeSafeInteger(count)
  );
}

const applicationStatusBadgeClasses: Record<string, string> = {
  Applied: "bg-slate-100 text-slate-700 ring-slate-500/20",
  Interviewing: "bg-blue-100 text-blue-800 ring-blue-600/20",
  Selected: "bg-green-100 text-green-800 ring-green-600/20",
  Rejected: "bg-red-100 text-red-800 ring-red-600/20",
  default: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

function getApplicationStatusBadge(status: string | null) {
  const label = status?.trim() || "Unknown";

  return {
    label,
    className:
      applicationStatusBadgeClasses[label] ??
      applicationStatusBadgeClasses.default,
  };
}

function formatApplicationDate(value: string | null): string {
  if (!value) {
    return "Date unavailable";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) {
    return "Date unavailable";
  }

  const [, year, month, day] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const daysInMonth = [
    31,
    yearNumber % 4 === 0 &&
    (yearNumber % 100 !== 0 || yearNumber % 400 === 0)
      ? 29
      : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][monthNumber - 1];

  if (
    daysInMonth === undefined ||
    dayNumber < 1 ||
    dayNumber > daysInMonth ||
    (value.length > 10 && !Number.isFinite(Date.parse(value)))
  ) {
    return "Date unavailable";
  }

  return `${day}/${month}/${year}`;
}

export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFirstName, setAuthFirstName] = useState("");
  const [authLastName, setAuthLastName] = useState("");
  const [authDeptId, setAuthDeptId] = useState("1");
  const [authGpa, setAuthGpa] = useState("");
  const [authGraduationYear, setAuthGraduationYear] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loadingOpportunities, setLoadingOpportunities] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [opportunityError, setOpportunityError] = useState("");
  const [studentError, setStudentError] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationsStudentId, setApplicationsStudentId] = useState("");
  const [appliedOpportunityIds, setAppliedOpportunityIds] = useState<number[]>(
    []
  );
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applicationsError, setApplicationsError] = useState("");
  const [applicationRefreshToken, setApplicationRefreshToken] = useState(0);
  const [submittingOpportunityId, setSubmittingOpportunityId] = useState<
    number | null
  >(null);
  const [applicationMessages, setApplicationMessages] = useState<
    Record<number, ApplicationMessage>
  >({});
  const [opportunitySearch, setOpportunitySearch] = useState("");
  const [recommendationInterests, setRecommendationInterests] = useState("");
  const [recommendationCareerPreferences, setRecommendationCareerPreferences] =
    useState("");
  const [recommendationResponse, setRecommendationResponse] =
    useState<SemanticRecommendationResponse | null>(null);
  const [recommendationError, setRecommendationError] = useState("");
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const recommendationRequestId = useRef(0);
  const recommendationStudentUserId = useRef<number | null>(null);

  useEffect(() => {
    const currentStudentUserId =
      authUser?.role === "Student" ? authUser.userId : null;
    if (recommendationStudentUserId.current === currentStudentUserId) return;

    recommendationStudentUserId.current = currentStudentUserId;
    recommendationRequestId.current += 1;
    setRecommendationResponse(null);
    setRecommendationError("");
    setRecommendationInterests("");
    setRecommendationCareerPreferences("");
    setLoadingRecommendations(false);
  }, [authUser?.role, authUser?.userId]);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();
        if (data.success) {
          setAuthUser(data.user);
          setLoadingStudents(data.user.role === "Student");
        } else {
          setLoadingStudents(false);
        }
      } finally {
        setAuthLoading(false);
      }
    }
    void loadSession();
  }, []);

  useEffect(() => {
    async function loadOpportunities() {
      try {
        const response = await fetch("/api/opportunities");
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load opportunities");
        }

        setOpportunities(data.opportunities);
      } catch (err) {
        setOpportunityError(
          err instanceof Error ? err.message : "Could not load opportunities"
        );
      } finally {
        setLoadingOpportunities(false);
      }
    }

    void loadOpportunities();
  }, []);

  useEffect(() => {
    if (authLoading || authUser?.role !== "Student") {
      return;
    }

    const controller = new AbortController();
    void fetch("/api/students", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load your student profile.");
        }

        if (
          !Array.isArray(data.students) ||
          !data.students.every(
            (student: unknown) =>
              isRecord(student) &&
              isNonNegativeSafeInteger(student.student_id) &&
              student.student_id > 0 &&
              student.user_id === authUser.userId &&
              typeof student.first_name === "string" &&
              typeof student.last_name === "string"
          )
        ) {
          throw new Error("Student profile data has an unexpected format.");
        }

        return data.students as Student[];
      })
      .then((studentProfiles) => {
        if (controller.signal.aborted) return;
        setStudents(studentProfiles);
        setSelectedStudentId(
          studentProfiles.length === 1
            ? String(studentProfiles[0].student_id)
            : ""
        );
        setStudentError("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStudents([]);
        setSelectedStudentId("");
        setStudentError(
          error instanceof Error
            ? error.message
            : "Could not load your student profile."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStudents(false);
      });

    return () => controller.abort();
  }, [authLoading, authUser?.role, authUser?.userId]);

  useEffect(() => {
    if (authUser?.role !== "Student") {
      if (authUser) {
        setSelectedStudentId("");
      }
      return;
    }
    const matchingStudents = students.filter(
      (candidate) => candidate.user_id === authUser.userId
    );
    if (matchingStudents.length !== 1) {
      setSelectedStudentId("");
      return;
    }
    setSelectedStudentId(String(matchingStudents[0].student_id));
  }, [authUser, students]);

  useEffect(() => {
    if (!selectedStudentId) {
      setApplications([]);
      setApplicationsStudentId("");
      setAppliedOpportunityIds([]);
      setApplicationsError("");
      setLoadingApplications(false);
      return;
    }

    const controller = new AbortController();

    async function loadApplications() {
      setLoadingApplications(true);
      setApplicationsError("");
      setApplications([]);

      try {
        const response = await fetch("/api/applications", {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || "Could not load applications");
        }

        if (!Array.isArray(data.applications)) {
          throw new Error("Application data has an unexpected format.");
        }

        if (controller.signal.aborted) {
          return;
        }

        setApplications(data.applications);
        setApplicationsStudentId(selectedStudentId);
        setAppliedOpportunityIds(
          data.applications.map((application: Application) => application.opp_id)
        );
      } catch (err) {
        if (!controller.signal.aborted) {
          setApplicationsError(
            err instanceof Error ? err.message : "Could not load applications"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingApplications(false);
        }
      }
    }

    void loadApplications();
    return () => controller.abort();
  }, [selectedStudentId, applicationRefreshToken]);

  async function submitAuthentication(event: React.FormEvent) {
    event.preventDefault();
    setAuthMessage("");

    const endpoint =
      authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      authMode === "login"
        ? { username: authUsername, password: authPassword }
        : {
            username: authUsername,
            password: authPassword,
            role: "Student",
            firstName: authFirstName,
            lastName: authLastName,
            deptId: Number(authDeptId),
            gpa: Number(authGpa),
            graduationYear: Number(authGraduationYear),
          };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Authentication failed.");
      }

      if (authMode === "register") {
        setAuthMode("login");
        setAuthPassword("");
        setAuthMessage("Registration successful. Sign in to continue.");
        return;
      }

      setAuthUser(data.user);
      setLoadingStudents(data.user.role === "Student");
      setStudents([]);
      setStudentError("");
      setAuthPassword("");
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Authentication failed."
      );
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setSelectedStudentId("");
    setStudents([]);
    setStudentError("");
    setLoadingStudents(false);
  }

  async function loadSemanticRecommendations(
    event?: React.FormEvent<HTMLFormElement>
  ) {
    event?.preventDefault();
    if (authUser?.role !== "Student") return;

    setRecommendationError("");
    setRecommendationResponse(null);

    const careerPreferences = recommendationCareerPreferences
      .split(",")
      .map((preference) => preference.trim())
      .filter(Boolean);
    if (
      recommendationInterests.length > 500 ||
      careerPreferences.length > 20 ||
      careerPreferences.some((preference) => preference.length > 80)
    ) {
      setRecommendationError(
        "Use up to 500 characters for interests and up to 20 career preferences of 80 characters each."
      );
      return;
    }

    const requestId = recommendationRequestId.current + 1;
    recommendationRequestId.current = requestId;
    setLoadingRecommendations(true);
    try {
      const response = await fetch("/api/vector-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "semantic",
          interests: recommendationInterests,
          careerPreferences,
        }),
      });

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error("The recommendation service returned invalid data.");
      }

      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.message === "string"
            ? data.message
            : "Could not load semantic recommendations."
        );
      }
      if (!isSemanticRecommendationResponse(data)) {
        throw new Error(
          "The recommendation service returned an unexpected response."
        );
      }

      if (requestId !== recommendationRequestId.current) return;
      setRecommendationResponse(data);
    } catch (error) {
      if (requestId !== recommendationRequestId.current) return;
      setRecommendationError(
        error instanceof Error
          ? error.message
          : "Could not load semantic recommendations."
      );
    } finally {
      if (requestId === recommendationRequestId.current) {
        setLoadingRecommendations(false);
      }
    }
  }

  async function searchOpportunitiesByQuery(searchValue: string) {
    setLoadingOpportunities(true);
    setOpportunityError("");

    try {
      const params = new URLSearchParams();
      if (searchValue.trim()) {
        params.set("q", searchValue.trim());
      }
      const response = await fetch(
        `/api/opportunities${params.size ? `?${params.toString()}` : ""}`
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load opportunities");
      }
      setOpportunities(data.opportunities);
    } catch (error) {
      setOpportunityError(
        error instanceof Error
          ? error.message
          : "Could not load opportunities"
      );
    } finally {
      setLoadingOpportunities(false);
    }
  }

  async function searchOpportunities(event: React.FormEvent) {
    event.preventDefault();
    await searchOpportunitiesByQuery(opportunitySearch);
  }

  function clearOpportunitySearch() {
    setOpportunitySearch("");
    void searchOpportunitiesByQuery("");
  }

  async function applyToOpportunity(oppId: number) {
    const studentId = Number(selectedStudentId);

    if (!Number.isInteger(studentId) || studentId <= 0) {
      setApplicationMessages((current) => ({
        ...current,
        [oppId]: { kind: "error", text: "Select a student before applying." },
      }));
      return;
    }

    setSubmittingOpportunityId(oppId);
    setApplicationMessages((current) => {
      const next = { ...current };
      delete next[oppId];
      return next;
    });

    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: studentId, opp_id: oppId }),
      });
      if (response.status === 409) {
        setAppliedOpportunityIds((current) =>
          current.includes(oppId) ? current : [...current, oppId]
        );
        setApplicationMessages((current) => ({
          ...current,
          [oppId]: {
            kind: "info",
            text: "Already Applied: this student has already applied to this opportunity.",
          },
        }));
        setApplicationRefreshToken((current) => current + 1);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not submit application");
      }

      setAppliedOpportunityIds((current) =>
        current.includes(oppId) ? current : [...current, oppId]
      );
      setApplicationMessages((current) => ({
        ...current,
        [oppId]: {
          kind: "success",
          text: "Application submitted successfully.",
        },
      }));
      setApplicationRefreshToken((current) => current + 1);
    } catch (err) {
      setApplicationMessages((current) => ({
        ...current,
        [oppId]: {
          kind: "error",
          text: err instanceof Error ? err.message : "Could not submit application",
        },
      }));
    } finally {
      setSubmittingOpportunityId(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">
            CampusConnect
          </p>
          <h1 className="mt-2 text-4xl font-bold">
            Placement & Internship Portal
          </h1>
          <p className="mt-3 text-slate-600">
            {authUser?.role === "Admin"
              ? "Review placement activity and program analytics."
              : authUser?.role === "CompanyRep"
                ? "Review opportunities and applications for your company."
                : "Explore opportunities available to students."}
          </p>
        </header>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {authLoading ? (
            <p className="text-slate-600">Checking session...</p>
          ) : authUser ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-slate-700">
                Signed in as <strong>{authUser.username}</strong>
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">
                  {authUser.role}
                </span>
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700"
              >
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={submitAuthentication} className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAuthMode("login")}
                  className={`rounded-lg px-4 py-2 font-semibold ${authMode === "login" ? "bg-blue-700 text-white" : "border border-slate-300"}`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode("register")}
                  className={`rounded-lg px-4 py-2 font-semibold ${authMode === "register" ? "bg-blue-700 text-white" : "border border-slate-300"}`}
                >
                  Student registration
                </button>
              </div>
              <input
                required
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                placeholder="Username"
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                required
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="Password"
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
              {authMode === "register" && (
                <>
                  <input
                    required
                    value={authFirstName}
                    onChange={(event) => setAuthFirstName(event.target.value)}
                    placeholder="First name"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <input
                    required
                    value={authLastName}
                    onChange={(event) => setAuthLastName(event.target.value)}
                    placeholder="Last name"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <input
                    required
                    type="number"
                    min="1"
                    value={authDeptId}
                    onChange={(event) => setAuthDeptId(event.target.value)}
                    placeholder="Department ID"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <input
                    required
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={authGpa}
                    onChange={(event) => setAuthGpa(event.target.value)}
                    placeholder="GPA"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                  <input
                    required
                    type="number"
                    min="2000"
                    value={authGraduationYear}
                    onChange={(event) => setAuthGraduationYear(event.target.value)}
                    placeholder="Graduation year"
                    className="rounded-lg border border-slate-300 px-3 py-2"
                  />
                </>
              )}
              <button
                type="submit"
                className="md:col-span-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white"
              >
                {authMode === "login" ? "Sign in" : "Register student"}
              </button>
              {authMessage && (
                <p role="status" className="md:col-span-2 text-sm text-slate-700">
                  {authMessage}
                </p>
              )}
            </form>
          )}
        </section>

        {authUser?.role === "Admin" ? (
          <AdminDashboard />
        ) : authUser?.role === "CompanyRep" ? (
          <CompanyRepresentativeDashboard />
        ) : authLoading ? (
          <p role="status" className="text-slate-600">
            Loading your dashboard...
          </p>
        ) : (
          <>
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="student"
            className="block text-sm font-semibold text-slate-700"
          >
            {authUser?.role === "Student"
              ? "Your student profile"
              : "Apply as a student"}
          </label>
          <select
            id="student"
            value={selectedStudentId}
            onChange={(event) => {
              setSelectedStudentId(event.target.value);
              setApplications([]);
              setApplicationsStudentId("");
              setAppliedOpportunityIds([]);
              setApplicationMessages({});
            }}
            disabled={
              authLoading ||
              authUser?.role !== "Student" ||
              loadingStudents ||
              students.length === 0 ||
              submittingOpportunityId !== null
            }
            className="mt-2 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:bg-slate-100"
          >
            <option value="">
              {authLoading
                ? "Checking session..."
                : loadingStudents
                  ? "Loading your profile..."
                  : authUser?.role === "Student" && students.length === 0
                    ? "No linked student profile"
                    : authUser?.role === "Student" && students.length > 1
                      ? "Select one of your profiles"
                      : authUser?.role === "Student"
                        ? "Your profile is selected"
                        : "Select a student"}
            </option>
            {students
              .filter((student) =>
                authUser?.role === "Student"
                  ? student.user_id === authUser.userId
                  : false
              )
              .map((student) => (
              <option key={student.student_id} value={student.student_id}>
                {student.first_name} {student.last_name} (ID: {student.student_id})
              </option>
              ))}
          </select>
          {studentError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {studentError}
            </p>
          )}
          {!loadingStudents && !studentError && students.length === 0 && (
            <p className="mt-2 text-sm text-slate-600">
              {authUser?.role === "Student"
                ? "No student profile is linked to your signed-in account."
                : "No students are available to apply."}
            </p>
          )}
        </section>

        {authUser?.role === "Student" && (
          <section
            aria-labelledby="semantic-recommendations-heading"
            className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2
              id="semantic-recommendations-heading"
              className="text-2xl font-semibold"
            >
              Semantic Opportunity Recommendations
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Describe your interests and career preferences to find eligible
              opportunities ranked by semantic similarity. Your student
              identity is resolved from your signed-in session.
            </p>

            <form
              onSubmit={(event) => void loadSemanticRecommendations(event)}
              className="mt-5 grid gap-4"
            >
              <div>
                <label
                  htmlFor="recommendation-interests"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Interests
                </label>
                <textarea
                  id="recommendation-interests"
                  maxLength={500}
                  rows={3}
                  disabled={loadingRecommendations}
                  value={recommendationInterests}
                  onChange={(event) =>
                    setRecommendationInterests(event.target.value)
                  }
                  placeholder="For example: backend systems, data engineering"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label
                  htmlFor="recommendation-career-preferences"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Career preferences
                </label>
                <input
                  id="recommendation-career-preferences"
                  type="text"
                  maxLength={1700}
                  disabled={loadingRecommendations}
                  value={recommendationCareerPreferences}
                  onChange={(event) =>
                    setRecommendationCareerPreferences(event.target.value)
                  }
                  placeholder="Comma-separated, e.g. platform engineering, software internships"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Up to 20 preferences, 80 characters each.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={loadingRecommendations}
                  className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {loadingRecommendations
                    ? "Finding recommendations..."
                    : recommendationError
                      ? "Retry recommendations"
                      : "Find recommendations"}
                </button>
                {loadingRecommendations && (
                  <p role="status" className="text-sm text-slate-600">
                    Finding eligible semantic matches...
                  </p>
                )}
              </div>
            </form>

            {recommendationError && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-red-100 p-4 text-red-700"
              >
                {recommendationError}
              </p>
            )}

            {recommendationResponse && (
              <div className="mt-6">
                {!recommendationResponse.profileFound && (
                  <p
                    role="status"
                    className="mb-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-900"
                  >
                    No saved skills profile was found. Recommendations use the
                    interests and career preferences entered above.
                  </p>
                )}
                {recommendationResponse.missingOpportunityEmbeddings !==
                  undefined &&
                  recommendationResponse.missingOpportunityEmbeddings > 0 && (
                    <p className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                      {recommendationResponse.missingOpportunityEmbeddings}{" "}
                      eligible{" "}
                      {recommendationResponse.missingOpportunityEmbeddings === 1
                        ? "opportunity is"
                        : "opportunities are"}{" "}
                      missing a current semantic embedding and may not appear.
                    </p>
                  )}

                {recommendationResponse.recommendations.length === 0 ? (
                  <p role="status" className="text-slate-600">
                    No relevant eligible recommendations were returned. Try
                    adjusting your interests or career preferences.
                  </p>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-slate-600">
                      {recommendationResponse.count} semantic{" "}
                      {recommendationResponse.count === 1
                        ? "recommendation"
                        : "recommendations"}
                      {recommendationResponse.eligibleOpportunities !==
                        undefined &&
                        ` from ${recommendationResponse.eligibleOpportunities} GPA- and deadline-eligible opportunities`}
                      .
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {recommendationResponse.recommendations.map(
                        (recommendation) => (
                          <article
                            key={recommendation.opp_id}
                            className="rounded-xl border border-slate-200 p-5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-semibold">
                                  {recommendation.title}
                                </h3>
                                <p className="mt-1 text-sm font-medium text-blue-700">
                                  {recommendation.company_name}
                                </p>
                              </div>
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                                {recommendation.type}
                              </span>
                            </div>
                            <div className="mt-4 space-y-2 text-sm text-slate-600">
                              <p>Industry: {recommendation.industry}</p>
                              <p>
                                Deadline:{" "}
                                {formatApplicationDate(recommendation.deadline)}
                              </p>
                              <p>
                                Cosine similarity:{" "}
                                {recommendation.similarity.toFixed(3)}
                              </p>
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Available Opportunities</h2>
          <span className="rounded-full bg-blue-100 px-4 py-2 text-sm text-blue-800">
            {opportunities.length} opportunities
          </span>
        </div>

        <form
          onSubmit={searchOpportunities}
          className="mb-8 flex flex-wrap gap-3"
          role="search"
        >
          <label htmlFor="opportunity-search" className="sr-only">
            Search opportunities
          </label>
          <input
            id="opportunity-search"
            type="search"
            maxLength={200}
            value={opportunitySearch}
            onChange={(event) => setOpportunitySearch(event.target.value)}
            placeholder="Search title, company, industry, or type"
            className="min-w-60 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
          <button
            type="submit"
            disabled={loadingOpportunities}
            className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
          >
            Search
          </button>
          <button
            type="button"
            onClick={clearOpportunitySearch}
            disabled={loadingOpportunities || !opportunitySearch}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:text-slate-400"
          >
            Clear
          </button>
        </form>

        <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">My Applications</h2>
          <p className="mt-2 text-sm text-slate-600">
            Applications linked to your signed-in student account.
          </p>

          {authUser?.role === "Student" &&
            !selectedStudentId &&
            loadingStudents && (
              <p role="status" className="mt-4 text-slate-600">
                Loading your student profile...
              </p>
            )}
          {authUser?.role === "Student" &&
            !selectedStudentId &&
            !loadingStudents &&
            !studentError &&
            students.length === 0 && (
              <p className="mt-4 text-slate-600">
                No student profile is linked to your signed-in account.
              </p>
            )}
          {authUser?.role === "Student" &&
            !selectedStudentId &&
            !loadingStudents &&
            !studentError &&
            students.length > 1 && (
              <p className="mt-4 text-slate-600">
                Select one of your profiles above to view its applications.
              </p>
            )}
          {authUser?.role !== "Student" && !selectedStudentId && (
            <p className="mt-4 text-slate-600">
              Select a student above to view their applications.
            </p>
          )}
          {loadingApplications && (
            <p className="mt-4 text-slate-600">Loading applications...</p>
          )}
          {applicationsError && (
            <p role="alert" className="mt-4 rounded-lg bg-red-100 p-4 text-red-700">
              {applicationsError}
            </p>
          )}
          {selectedStudentId &&
            !loadingApplications &&
            !applicationsError &&
            applications.length === 0 && (
              <p className="mt-4 text-slate-600">
                No applications found for this student.
              </p>
            )}

          {applications.length > 0 && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {applications.map((application) => {
                const statusBadge = getApplicationStatusBadge(
                  application.status
                );

                return (
                  <article
                    key={application.app_id}
                    className="rounded-xl border border-slate-200 p-5"
                  >
                    <h3 className="text-lg font-semibold">
                      {application.opportunity_title}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-blue-700">
                      {application.company_name}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                      <p>
                        Applied{" "}
                        {formatApplicationDate(application.applied_date)}
                      </p>
                      <p>
                        Status:{" "}
                        <span
                          className={`ml-1 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {loadingOpportunities && <p>Loading opportunities...</p>}

        {opportunityError && (
          <p className="rounded-lg bg-red-100 p-4 text-red-700">
            {opportunityError}
          </p>
        )}

        {!loadingOpportunities &&
          !opportunityError &&
          opportunities.length === 0 && (
            <p>
              {opportunitySearch.trim()
                ? "No opportunities matched your search."
                : "No opportunities are available right now."}
            </p>
          )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {opportunities.map((job) => {
            const message = applicationMessages[job.opp_id];
            const isSubmitting = submittingOpportunityId === job.opp_id;
            const alreadyApplied =
              applicationsStudentId === selectedStudentId &&
              appliedOpportunityIds.includes(job.opp_id);

            return (
              <article
                key={job.opp_id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">{job.title}</h3>
                    <p className="mt-2 text-sm font-medium text-blue-700">
                      {job.company_name}
                    </p>
                  </div>

                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {job.type}
                  </span>
                </div>

                <p className="mt-5 text-sm text-slate-500">
                  Annual salary / stipend
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  ₹{Number(job.salary).toLocaleString("en-IN")}
                </p>

                <div className="mt-5 space-y-2 text-sm text-slate-600">
                  <p>Minimum GPA: {job.min_gpa}</p>
                  <p>
                    Deadline:{" "}
                    {new Date(job.deadline).toLocaleDateString("en-IN")}
                  </p>
                  <p>Opportunity ID: {job.opp_id}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void applyToOpportunity(job.opp_id)}
                  disabled={
                    authUser?.role !== "Student" ||
                    loadingStudents ||
                    students.length === 0 ||
                    !selectedStudentId ||
                    loadingApplications ||
                    Boolean(applicationsError) ||
                    applicationsStudentId !== selectedStudentId ||
                    alreadyApplied ||
                    submittingOpportunityId !== null
                  }
                  className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {alreadyApplied
                    ? "Already Applied"
                    : isSubmitting
                      ? "Applying..."
                      : "Apply Now"}
                </button>
                {message && (
                  <p
                    role={message.kind === "error" ? "alert" : "status"}
                    className={`mt-3 text-sm ${
                      message.kind === "success"
                        ? "text-green-700"
                        : message.kind === "info"
                          ? "text-blue-700"
                          : "text-red-700"
                    }`}
                  >
                    {message.text}
                  </p>
                )}
              </article>
            );
          })}
        </div>
          </>
        )}
      </div>
    </main>
  );
}
