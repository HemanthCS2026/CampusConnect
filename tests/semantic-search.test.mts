import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedRequestBody } from "../lib/request-body.ts";
import {
  buildOpportunityEmbeddingText,
  buildStudentEmbeddingText,
  cosineSimilarity,
  generateSemanticEmbeddings,
  hashEmbeddingSource,
  isOpportunityEligible,
  isAuthorizedSemanticStudent,
  isSemanticEmbedding,
  parseStudentPreferences,
  rankSemanticOpportunities,
  SEMANTIC_MODEL_NAME,
  SEMANTIC_MODEL_REVISION,
  SEMANTIC_VECTOR_DIMENSIONS,
  type SemanticOpportunity,
} from "../lib/semantic-search.ts";

function vector(index: number): number[] {
  const result = Array.from({ length: SEMANTIC_VECTOR_DIMENSIONS }, () => 0);
  result[index] = 1;
  return result;
}

function opportunity(
  opp_id: number,
  embedding: number[],
  title = `Opportunity ${opp_id}`
): SemanticOpportunity {
  return {
    opp_id,
    title,
    type: "Internship",
    company_name: "Example Co",
    industry: "Software",
    deadline: "2027-01-01",
    embedding,
  };
}

test("validates 384 finite dimensions and rejects malformed vectors", () => {
  assert.equal(isSemanticEmbedding(vector(0)), true);
  assert.equal(isSemanticEmbedding([1, 2]), false);
  assert.equal(isSemanticEmbedding(undefined), false);
  assert.equal(isSemanticEmbedding([...vector(0).slice(0, -1), Number.NaN]), false);
});

test("cosine similarity handles exact, orthogonal, and zero vectors", () => {
  assert.equal(cosineSimilarity(vector(0), vector(0)), 1);
  assert.equal(cosineSimilarity(vector(0), vector(1)), 0);
  assert.equal(cosineSimilarity(Array(384).fill(0), vector(1)), 0);
});

test("ranks relevant semantic candidates above unrelated candidates", () => {
  const ranked = rankSemanticOpportunities(vector(0), [
    opportunity(3, vector(1), "Unrelated design role"),
    opportunity(2, vector(0), "Related backend role"),
  ]);
  assert.deepEqual(ranked.map((item) => item.opp_id), [2]);
  assert.equal(ranked[0]?.similarity, 1);
  assert.equal("embedding" in (ranked[0] ?? {}), false);
});

test("eligibility filters enforce GPA and inclusive deadline boundaries", () => {
  assert.equal(
    isOpportunityEligible(
      { deadline: "2026-11-20", min_gpa: 3.5 },
      3.5,
      "2026-11-20"
    ),
    true
  );
  assert.equal(
    isOpportunityEligible(
      { deadline: "2026-11-19", min_gpa: null },
      4.0,
      "2026-11-20"
    ),
    false
  );
  assert.equal(
    isOpportunityEligible(
      { deadline: "2026-11-21", min_gpa: 3.6 },
      3.5,
      "2026-11-20"
    ),
    false
  );
});

test("student preference parsing rejects client-supplied identity fields", () => {
  assert.deepEqual(
    parseStudentPreferences({
      interests: "backend systems",
      careerPreferences: ["Platform engineering"],
    }),
    {
      preferences: {
        interests: "backend systems",
        careerPreferences: ["Platform engineering"],
      },
    }
  );
  assert.equal(
    "error" in parseStudentPreferences({ student_id: 7, interests: "backend" }),
    true
  );
  assert.equal(
    isAuthorizedSemanticStudent({ userId: 7, username: "student", role: "Student" }),
    true
  );
  assert.equal(
    isAuthorizedSemanticStudent({ userId: 7, username: "admin", role: "Admin" }),
    false
  );
  assert.equal(isAuthorizedSemanticStudent(null), false);
});

test("embedding source text includes available student and opportunity fields", () => {
  const student = buildStudentEmbeddingText(
    [{ name: "python", proficiency: "advanced" }],
    {
      interests: "backend",
      careerPreferences: ["platform engineering"],
    }
  );
  const posting = buildOpportunityEmbeddingText({
    title: "Backend Intern",
    type: "Internship",
    company_name: "Example",
    industry: "Software",
    description: "Build APIs",
    required_skills: ["Python"],
  });
  assert.match(student, /Skills: python \(advanced\)/);
  assert.match(student, /Career preferences: platform engineering/);
  assert.match(posting, /Description: Build APIs/);
  assert.match(posting, /Required skills: Python/);
});

test("empty student profiles produce no text and source hashes are reproducible", () => {
  const emptyText = buildStudentEmbeddingText([], {
    interests: "",
    careerPreferences: [],
  });
  assert.equal(emptyText, "");
  assert.equal(hashEmbeddingSource("sample"), hashEmbeddingSource("sample"));
  assert.notEqual(hashEmbeddingSource("sample"), hashEmbeddingSource("changed"));
});

test("bounded request reader rejects oversized and malformed UTF-8 bodies", async () => {
  assert.equal(
    await readBoundedRequestBody(
      new Request("http://localhost", { method: "POST", body: "12345" }),
      4
    ),
    null
  );
  await assert.rejects(
    readBoundedRequestBody(
      new Request("http://localhost", {
        method: "POST",
        body: new Uint8Array([0xff]),
      }),
      4
    )
  );
});

test("embedding client rejects mismatched model revisions and accepts valid service vectors", async () => {
  const originalFetch = globalThis.fetch;
  const embedding = vector(0);
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          model: SEMANTIC_MODEL_NAME,
          revision: SEMANTIC_MODEL_REVISION,
          embeddings: [embedding],
        }),
        { status: 200 }
      );
    assert.deepEqual(await generateSemanticEmbeddings(["sample text"]), [
      embedding,
    ]);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          model: SEMANTIC_MODEL_NAME,
          revision: "unexpected-model-revision",
          embeddings: [embedding],
        }),
        { status: 200 }
      );
    await assert.rejects(generateSemanticEmbeddings(["sample text"]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
