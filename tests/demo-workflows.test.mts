import assert from "node:assert/strict";
import test from "node:test";
import { requireRole } from "../lib/authorization.ts";
import { companyDashboardQueries } from "../lib/company-representative.ts";
import {
  parseSkillEntries,
  SKILL_PROFICIENCIES,
} from "../lib/student-skills.ts";
import {
  buildOpportunityEmbeddingText,
  buildStudentEmbeddingText,
  hashEmbeddingSource,
  isOpportunityEligible,
  isSemanticEmbedding,
  parseStudentPreferences,
  rankSemanticOpportunities,
  type OpportunitySemanticSource,
  type SemanticOpportunity,
} from "../lib/semantic-search.ts";
import {
  isValidResumeUrl,
  validatePersonName,
  validateUsername,
} from "../lib/input-validation.ts";

test("Student Demo Workflow: Registration, Skills, Semantic Recommendations, and Application Validation", () => {
  // 1. Registration input validation
  const validUsername = validateUsername("  student_alice  ");
  assert.equal(validUsername.ok, true);
  if (validUsername.ok) {
    assert.equal(validUsername.value, "student_alice");
  }

  const validFirstName = validatePersonName("Alice");
  const validLastName = validatePersonName("Smith");
  assert.equal(validFirstName.ok, true);
  assert.equal(validLastName.ok, true);

  // Reject invalid registration data
  assert.equal(validateUsername("").ok, false);
  assert.equal(validateUsername("a".repeat(51)).ok, false);
  assert.equal(validatePersonName("").ok, false);

  // 2. Student session authorization
  const studentUser = {
    userId: 101,
    username: "student_alice",
    role: "Student" as const,
  };
  assert.equal(requireRole(studentUser, ["Student"]), studentUser);
  assert.throws(() => requireRole(studentUser, ["Admin"]), /Forbidden/);
  assert.throws(() => requireRole(studentUser, ["CompanyRep"]), /Forbidden/);

  // 3. Skill profile management (MongoDB flexible store)
  const rawSkills = [
    { name: "TypeScript", proficiency: "advanced" },
    { name: "PostgreSQL", proficiency: "intermediate" },
    { name: "Docker", proficiency: "beginner" },
  ];
  const parsedSkills = parseSkillEntries(rawSkills);
  assert.equal("skills" in parsedSkills, true);
  if ("skills" in parsedSkills) {
    assert.equal(parsedSkills.skills.length, 3);
    // Skills are normalized to lowercase
    assert.deepEqual(
      parsedSkills.skills.map((s) => s.name),
      ["typescript", "postgresql", "docker"]
    );
  }

  // Proficiency validation
  assert.deepEqual(SKILL_PROFICIENCIES, [
    "beginner",
    "intermediate",
    "advanced",
    "expert",
  ]);
  const invalidSkills = parseSkillEntries([
    { name: "Python", proficiency: "invalid_proficiency" },
  ]);
  assert.equal("error" in invalidSkills, true);

  // 4. Semantic recommendation input assembly (combining MongoDB skills + request-scoped preferences)
  const preferences = parseStudentPreferences({
    interests: "full stack web development and cloud systems",
    careerPreferences: ["backend engineer", "software developer"],
  });
  assert.equal("preferences" in preferences, true);

  let studentText = "";
  if ("skills" in parsedSkills && "preferences" in preferences) {
    studentText = buildStudentEmbeddingText(
      parsedSkills.skills,
      preferences.preferences
    );
  }
  assert.match(studentText, /Skills:/);
  assert.match(studentText, /typescript \(advanced\)/);
  assert.match(studentText, /postgresql \(intermediate\)/);
  assert.match(studentText, /Interests: full stack web development/);
  assert.match(studentText, /Career preferences: backend engineer/);

  // Ensure student personal identifiers (GPA, student ID) are NEVER in embedding text
  assert.doesNotMatch(studentText, /studentId/i);
  assert.doesNotMatch(studentText, /gpa/i);

  // 5. Opportunity eligibility checks (GPA and Deadline boundaries)
  const studentGpa = 8.5;
  const today = "2026-11-21";

  // Eligible: GPA meets requirement and deadline is in the future
  assert.equal(
    isOpportunityEligible(
      { deadline: "2026-12-01", min_gpa: 8.0 },
      studentGpa,
      today
    ),
    true
  );
  // Eligible: No minimum GPA specified
  assert.equal(
    isOpportunityEligible(
      { deadline: "2026-11-21", min_gpa: null },
      studentGpa,
      today
    ),
    true
  );
  // Ineligible: Student GPA below requirement
  assert.equal(
    isOpportunityEligible(
      { deadline: "2026-12-01", min_gpa: 9.0 },
      studentGpa,
      today
    ),
    false
  );
  // Ineligible: Past deadline
  assert.equal(
    isOpportunityEligible(
      { deadline: "2026-11-20", min_gpa: 7.0 },
      studentGpa,
      today
    ),
    false
  );

  // 6. Semantic opportunity ranking using cosine similarity
  // Create unit 384-dimensional synthetic vectors
  const makeVector = (nonZeroIndex: number): number[] => {
    const vec = new Array(384).fill(0);
    vec[nonZeroIndex] = 1.0;
    return vec;
  };

  const studentVec = makeVector(0);
  const highlyRelevantVec = makeVector(0); // similarity = 1.0
  const partiallyRelevantVec = new Array(384).fill(0);
  partiallyRelevantVec[0] = 0.6;
  partiallyRelevantVec[1] = 0.8; // unit vector, similarity = 0.6
  const orthogonalVec = makeVector(10); // similarity = 0.0

  assert.equal(isSemanticEmbedding(studentVec), true);
  assert.equal(isSemanticEmbedding(highlyRelevantVec), true);

  const candidates: SemanticOpportunity[] = [
    {
      opp_id: 1,
      title: "Backend Engineer",
      type: "Placement",
      company_name: "Acme Tech",
      industry: "Software",
      deadline: "2026-12-15",
      embedding: highlyRelevantVec,
    },
    {
      opp_id: 2,
      title: "Cloud Architect",
      type: "Placement",
      company_name: "CloudCo",
      industry: "Cloud",
      deadline: "2026-12-20",
      embedding: partiallyRelevantVec,
    },
    {
      opp_id: 3,
      title: "Content Writer",
      type: "Internship",
      company_name: "MediaCorp",
      industry: "Publishing",
      deadline: "2026-12-30",
      embedding: orthogonalVec,
    },
  ];

  const ranked = rankSemanticOpportunities(studentVec, candidates);
  // Expect only positive similarities (opp 1 and 2, opp 3 filtered out because sim <= 0)
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].opp_id, 1);
  assert.equal(ranked[0].similarity, 1.0);
  assert.equal(ranked[1].opp_id, 2);
  assert.equal(ranked[1].similarity, 0.6);

  // 7. Application validation
  assert.equal(isValidResumeUrl("https://example.com/resumes/alice.pdf"), true);
  assert.equal(isValidResumeUrl(null), true);
  assert.equal(isValidResumeUrl("https://example.com/" + "a".repeat(250)), false); // > 255 chars
});

test("CompanyRep Demo Workflow: Authentication, Role Isolation, and Data Privacy", () => {
  const companyRepUser = {
    userId: 42,
    username: "rep_google",
    role: "CompanyRep" as const,
  };

  // 1. Role authorization
  assert.equal(
    requireRole(companyRepUser, ["CompanyRep"]),
    companyRepUser
  );
  assert.throws(() => requireRole(companyRepUser, ["Student"]), /Forbidden/);
  assert.throws(() => requireRole(companyRepUser, ["Admin"]), /Forbidden/);

  // 2. Strict company isolation in SQL queries
  const queries = companyDashboardQueries(companyRepUser.userId);

  // Opportunities query must bind strictly to the authenticated rep's user_id
  assert.deepEqual(queries.opportunities.values, [42]);
  assert.match(queries.opportunities.text, /WHERE rep\.user_id = \$1/);

  // Applications query must join company_reps and filter strictly by rep.user_id = $1
  assert.deepEqual(queries.applications.values, [42]);
  assert.match(queries.applications.text, /rep\.company_id = opportunity\.company_id/);
  assert.match(queries.applications.text, /WHERE rep\.user_id = \$1/);

  // 3. Privacy preservation: CompanyRep must never receive resume_url or account passwords
  assert.doesNotMatch(queries.applications.text, /resume_url/i);
  assert.doesNotMatch(queries.applications.text, /password/i);
  assert.doesNotMatch(queries.opportunities.text, /password/i);
});

test("Admin Demo Workflow: Role Authorization, Application Analytics, and Embedding Maintenance", () => {
  const adminUser = {
    userId: 1,
    username: "admin_pavan",
    role: "Admin" as const,
  };

  // 1. Role authorization
  assert.equal(requireRole(adminUser, ["Admin"]), adminUser);
  assert.throws(
    () =>
      requireRole(
        { userId: 5, username: "student", role: "Student" },
        ["Admin"]
      ),
    /Forbidden/
  );
  assert.throws(
    () =>
      requireRole(
        { userId: 6, username: "rep", role: "CompanyRep" },
        ["Admin"]
      ),
    /Forbidden/
  );

  // 2. Opportunity text assembly for semantic embedding generation
  const oppSource: OpportunitySemanticSource = {
    title: "Software Engineer",
    type: "Placement",
    company_name: "PES Innovations",
    industry: "Information Technology",
    description: "Develop robust enterprise backend microservices.",
    required_skills: ["Go", "Kubernetes", "PostgreSQL"],
  };

  const oppText = buildOpportunityEmbeddingText(oppSource);
  assert.match(oppText, /Title: Software Engineer/);
  assert.match(oppText, /Job type: Placement/);
  assert.match(oppText, /Company: PES Innovations/);
  assert.match(oppText, /Industry: Information Technology/);
  assert.match(oppText, /Description: Develop robust/);
  assert.match(oppText, /Required skills: Go, Kubernetes, PostgreSQL/);

  // 3. Stale embedding detection using deterministic SHA-256 source hash
  const initialHash = hashEmbeddingSource(oppText);
  assert.equal(initialHash.length, 64);
  assert.match(initialHash, /^[0-9a-f]{64}$/);

  // Changing source text changes the hash, flagging it for Admin regeneration
  const updatedOppSource = {
    ...oppSource,
    description: "Develop robust distributed systems and cloud services.",
  };
  const updatedOppText = buildOpportunityEmbeddingText(updatedOppSource);
  const updatedHash = hashEmbeddingSource(updatedOppText);
  assert.notEqual(initialHash, updatedHash);
});
