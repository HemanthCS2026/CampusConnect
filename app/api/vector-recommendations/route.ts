import { NextResponse } from "next/server";
import { Int32 } from "mongodb";
import pool from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";
import {
  getStudentSkillProfilesCollection,
  type StudentSkillProfileDocument,
} from "@/lib/mongodb";
import { findStudentIdentity } from "@/lib/student-identity";
import type { StudentIdentity } from "@/lib/student-identity";
import { parseSkillEntries } from "@/lib/student-skills";
import { rankTextByTfIdfCosine } from "@/lib/vector-search";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  buildStudentEmbeddingText,
  buildOpportunityEmbeddingText,
  generateSemanticEmbeddings,
  hashEmbeddingSource,
  isAuthorizedSemanticStudent,
  isOpportunityEligible,
  isSemanticEmbedding,
  parseStudentPreferences,
  readBoundedRequestBody,
  rankSemanticOpportunities,
  SEMANTIC_MODEL_NAME,
  SEMANTIC_MODEL_REVISION,
  type OpportunitySemanticSource,
  type SemanticOpportunity,
} from "@/lib/semantic-search";

type EligibleOpportunity = OpportunitySemanticSource & {
  opp_id: number;
  deadline: string;
  min_gpa: number | string | null;
  eligible_on: string;
  embedding: number[] | null;
  embedding_source_hash: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStudentUser(request: Request):
  | { user: AuthUser }
  | { response: NextResponse } {
  const sessionUser = getSessionUser(request);
  if (isAuthorizedSemanticStudent(sessionUser)) {
    return { user: sessionUser };
  }
  return {
    response: NextResponse.json(
      { success: false, message: "Sign in as a student." },
      { status: sessionUser ? 403 : 401 }
    ),
  };
}

function serviceUnavailable(message: string) {
  return NextResponse.json({ success: false, message }, { status: 503 });
}

async function loadStudentProfile(studentId: number) {
  const collection = await getStudentSkillProfilesCollection();
  return collection.findOne(
    { studentId: new Int32(studentId) },
    { projection: { _id: 0, skills: 1 } }
  );
}

async function getOrCreateStudentEmbedding(
  studentId: number,
  sourceText: string
): Promise<number[]> {
  const sourceHash = hashEmbeddingSource(sourceText);
  const cached = await pool.query<{ embedding: number[] }>(
    `SELECT embedding
     FROM public.student_semantic_embeddings
     WHERE student_id = $1
       AND model_name = $2
       AND model_revision = $3
       AND source_hash = $4`,
    [studentId, SEMANTIC_MODEL_NAME, SEMANTIC_MODEL_REVISION, sourceHash]
  );
  const existing = cached.rows[0]?.embedding;
  if (isSemanticEmbedding(existing)) return existing;

  const [embedding] = await generateSemanticEmbeddings([sourceText]);
  if (!embedding) {
    throw new Error("Embedding service returned no student vector.");
  }

  await pool.query(
    `INSERT INTO public.student_semantic_embeddings
       (student_id, model_name, model_revision, source_hash, embedding, generated_at)
     VALUES ($1, $2, $3, $4, $5::real[], CURRENT_TIMESTAMP)
     ON CONFLICT (student_id) DO UPDATE
     SET model_name = EXCLUDED.model_name,
         model_revision = EXCLUDED.model_revision,
         source_hash = EXCLUDED.source_hash,
         embedding = EXCLUDED.embedding,
         generated_at = EXCLUDED.generated_at`,
    [
      studentId,
      SEMANTIC_MODEL_NAME,
      SEMANTIC_MODEL_REVISION,
      sourceHash,
      embedding,
    ]
  );
  return embedding;
}

async function lexicalRecommendations(
  identity: StudentIdentity,
  profile: StudentSkillProfileDocument | null,
  skills: string[],
  interests: string,
  careerPreferences: string[]
) {
  const queryText = [...skills, interests, ...careerPreferences]
    .filter(Boolean)
    .join(" ");
  const result = await pool.query<EligibleOpportunity>(
    `SELECT
       o.opp_id,
       o.title,
       o.type,
       c.company_name,
       c.industry,
       o.deadline::text AS deadline,
       o.min_gpa,
       CURRENT_DATE::text AS eligible_on,
       NULL::real[] AS embedding,
       NULL::text AS embedding_source_hash,
       NULL::text AS description,
       ARRAY[]::text[] AS required_skills
     FROM public.opportunities AS o
     JOIN public.companies AS c
       ON c.company_id = o.company_id
     WHERE o.deadline >= CURRENT_DATE
       AND (o.min_gpa IS NULL OR o.min_gpa <= $1)
     ORDER BY o.opp_id`,
    [identity.gpa]
  );
  const opportunities = result.rows.filter((item) =>
    isOpportunityEligible(
      {
        deadline: item.deadline,
        min_gpa: item.min_gpa === null ? null : Number(item.min_gpa),
      },
      identity.gpa,
      item.eligible_on
    )
  );
  const similarities = rankTextByTfIdfCosine(
    queryText,
    opportunities.map((opportunity) =>
      [
        opportunity.title,
        opportunity.type,
        opportunity.company_name,
        opportunity.industry,
      ].join(" ")
    )
  );
  const recommendations = opportunities
    .map((opportunity, index) => ({
      opp_id: opportunity.opp_id,
      title: opportunity.title,
      type: opportunity.type,
      company_name: opportunity.company_name,
      industry: opportunity.industry,
      deadline: opportunity.deadline,
      similarity: similarities[index] ?? 0,
    }))
    .filter((recommendation) => recommendation.similarity > 0)
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.opp_id - right.opp_id
    )
    .slice(0, 10)
    .map((recommendation) => ({
      ...recommendation,
      similarity: Number(recommendation.similarity.toFixed(6)),
    }));

  return {
    success: true,
    mode: "lexical-tfidf-cosine",
    profileFound: Boolean(profile),
    count: recommendations.length,
    recommendations,
  };
}

export async function POST(request: Request) {
  const session = getStudentUser(request);
  if ("response" in session) return session.response;

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Cross-origin recommendation requests are not allowed." },
      { status: 403 }
    );
  }

  let body: unknown;
  let bodyText: string | null;
  try {
    bodyText = await readBoundedRequestBody(request, 10_000);
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid UTF-8." },
      { status: 400 }
    );
  }
  if (bodyText === null) {
    return NextResponse.json(
      { success: false, message: "Request body is too large." },
      { status: 413 }
    );
  }
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    return NextResponse.json(
      { success: false, message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (
    !isRecord(body) ||
    Object.keys(body).some(
      (key) =>
        key !== "mode" &&
        key !== "interests" &&
        key !== "careerPreferences"
    ) ||
    (body.mode !== undefined &&
      body.mode !== "semantic" &&
      body.mode !== "lexical")
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Provide only mode, interests, and careerPreferences; identity is resolved from the session.",
      },
      { status: 400 }
    );
  }

  const parsedPreferences = parseStudentPreferences({
    interests: body.interests,
    careerPreferences: body.careerPreferences,
  });
  if ("error" in parsedPreferences) {
    return NextResponse.json(
      { success: false, message: parsedPreferences.error },
      { status: 400 }
    );
  }
  const mode = body.mode ?? "semantic";

  let identity: StudentIdentity | null;
  try {
    identity = await findStudentIdentity(session.user.userId);
  } catch {
    console.error("Student identity lookup failed for recommendations.");
    return NextResponse.json(
      { success: false, message: "Student profile is unavailable." },
      { status: 500 }
    );
  }
  if (!identity) {
    return NextResponse.json(
      { success: false, message: "Student profile not found." },
      { status: 404 }
    );
  }

  let profile: StudentSkillProfileDocument | null;
  try {
    profile = await loadStudentProfile(identity.studentId);
  } catch {
    console.error("MongoDB skill profile lookup failed for recommendations.");
    return serviceUnavailable(
      "Recommendations are unavailable. Configure MongoDB and run the collection setup script."
    );
  }

  const parsedSkills = parseSkillEntries(profile?.skills ?? []);
  if ("error" in parsedSkills) {
    return serviceUnavailable("The stored skill profile has an invalid shape.");
  }
  const skills = parsedSkills.skills;
  const { interests, careerPreferences } = parsedPreferences.preferences;

  if (mode === "lexical") {
    try {
      return NextResponse.json(
        await lexicalRecommendations(
          identity,
          profile,
          skills.map((skill) => skill.name),
          interests,
          careerPreferences
        )
      );
    } catch {
      console.error("PostgreSQL opportunity retrieval failed for lexical recommendations.");
      return NextResponse.json(
        { success: false, message: "Eligible opportunities are unavailable." },
        { status: 500 }
      );
    }
  }

  const studentText = buildStudentEmbeddingText(skills, {
    interests,
    careerPreferences,
  });
  if (!studentText) {
    return NextResponse.json({
      success: true,
      mode: "semantic-embedding-cosine",
      model: SEMANTIC_MODEL_NAME,
      revision: SEMANTIC_MODEL_REVISION,
      dimensions: 384,
      profileFound: Boolean(profile),
      count: 0,
      recommendations: [],
    });
  }

  let studentEmbedding: number[];
  try {
    studentEmbedding = await getOrCreateStudentEmbedding(
      identity.studentId,
      studentText
    );
  } catch {
    console.error("Student semantic embedding could not be loaded or generated.");
    return serviceUnavailable(
      "Semantic recommendations are unavailable. Apply the semantic vector migration and start the local embedding service."
    );
  }

  let opportunityRows: EligibleOpportunity[];
  try {
    const result = await pool.query<EligibleOpportunity>(
      `SELECT
         o.opp_id,
         o.title,
         o.type,
         c.company_name,
         c.industry,
         o.deadline::text AS deadline,
         o.min_gpa,
         CURRENT_DATE::text AS eligible_on,
         content.description,
         COALESCE(content.required_skills, ARRAY[]::text[]) AS required_skills,
         embeddings.embedding,
         embeddings.source_hash AS embedding_source_hash
       FROM public.opportunities AS o
       JOIN public.companies AS c
         ON c.company_id = o.company_id
       LEFT JOIN public.opportunity_semantic_content AS content
         ON content.opp_id = o.opp_id
       LEFT JOIN public.opportunity_semantic_embeddings AS embeddings
         ON embeddings.opp_id = o.opp_id
        AND embeddings.model_name = $2
        AND embeddings.model_revision = $3
       WHERE o.deadline >= CURRENT_DATE
         AND (o.min_gpa IS NULL OR o.min_gpa <= $1)
       ORDER BY o.opp_id`,
      [identity.gpa, SEMANTIC_MODEL_NAME, SEMANTIC_MODEL_REVISION]
    );
    opportunityRows = result.rows;
  } catch {
    console.error("Semantic opportunity vectors could not be loaded.");
    return serviceUnavailable(
      "Semantic recommendation storage is unavailable. Apply db/semantic-vector-search.sql."
    );
  }

  const eligibleRows = opportunityRows.filter((item) =>
    isOpportunityEligible(
      {
        deadline: item.deadline,
        min_gpa: item.min_gpa === null ? null : Number(item.min_gpa),
      },
      identity.gpa,
      item.eligible_on
    )
  );
  if (eligibleRows.length > 0 && !eligibleRows.some((item) =>
    isSemanticEmbedding(item.embedding)
  )) {
    return serviceUnavailable(
      "No eligible opportunity embeddings exist yet. An Admin must run the semantic embedding generation endpoint."
    );
  }

  const candidates: SemanticOpportunity[] = eligibleRows
    .filter(
      (
        item
      ): item is EligibleOpportunity & { embedding: number[] } =>
        isSemanticEmbedding(item.embedding) &&
        item.embedding_source_hash ===
          hashEmbeddingSource(buildOpportunityEmbeddingText(item))
    )
    .map((item) => ({
      opp_id: item.opp_id,
      title: item.title,
      type: item.type,
      company_name: item.company_name,
      industry: item.industry,
      deadline: item.deadline,
      embedding: item.embedding,
    }));
  const recommendations = rankSemanticOpportunities(
    studentEmbedding,
    candidates
  );

  return NextResponse.json({
    success: true,
    mode: "semantic-embedding-cosine",
    model: SEMANTIC_MODEL_NAME,
    revision: SEMANTIC_MODEL_REVISION,
    dimensions: 384,
    profileFound: Boolean(profile),
    eligibleOpportunities: eligibleRows.length,
    embeddedOpportunities: candidates.length,
    missingOpportunityEmbeddings: eligibleRows.length - candidates.length,
    count: recommendations.length,
    recommendations,
  });
}
