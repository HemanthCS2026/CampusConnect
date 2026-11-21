import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth";

export const SEMANTIC_MODEL_NAME =
  "sentence-transformers/all-MiniLM-L6-v2";
export const SEMANTIC_MODEL_REVISION =
  "1110a243fdf4706b3f48f1d95db1a4f5529b4d41";
export const SEMANTIC_VECTOR_DIMENSIONS = 384;
const MAX_EMBEDDING_BATCH_SIZE = 32;
const MAX_EMBEDDING_TEXT_LENGTH = 20_000;

export type StudentPreferences = {
  interests: string;
  careerPreferences: string[];
};

export type EmbeddingSkill = string | { name: string; proficiency: string };

export function isAuthorizedSemanticStudent(
  user: AuthUser | null
): user is AuthUser {
  return (
    user !== null &&
    user.role === "Student" &&
    Number.isSafeInteger(user.userId) &&
    user.userId > 0
  );
}

export type OpportunitySemanticSource = {
  title: string;
  type: string;
  company_name: string;
  industry: string;
  description: string | null;
  required_skills: string[];
};

export type SemanticOpportunity = {
  opp_id: number;
  title: string;
  type: string;
  company_name: string;
  industry: string;
  deadline: string;
  embedding: number[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function parseStudentPreferences(
  value: unknown
): { preferences: StudentPreferences } | { error: string } {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => key !== "interests" && key !== "careerPreferences"
    )
  ) {
    return { error: "Provide only interests and careerPreferences." };
  }

  const rawInterests = value.interests ?? "";
  const rawCareerPreferences = value.careerPreferences ?? [];
  if (
    typeof rawInterests !== "string" ||
    rawInterests.length > 500 ||
    hasControlCharacters(rawInterests) ||
    !Array.isArray(rawCareerPreferences) ||
    rawCareerPreferences.length > 20
  ) {
    return { error: "Student preferences contain invalid values." };
  }

  const careerPreferences: string[] = [];
  const seenPreferences = new Set<string>();
  for (const candidate of rawCareerPreferences) {
    if (
      typeof candidate !== "string" ||
      candidate.length > 80 ||
      hasControlCharacters(candidate)
    ) {
      return { error: "Each career preference must be a valid short string." };
    }

    const preference = normalizeText(candidate);
    if (!preference) {
      return { error: "Career preferences cannot be blank." };
    }

    const key = preference.toLowerCase();
    if (!seenPreferences.has(key)) {
      careerPreferences.push(preference);
      seenPreferences.add(key);
    }
  }

  return {
    preferences: {
      interests: normalizeText(rawInterests),
      careerPreferences,
    },
  };
}

export function buildStudentEmbeddingText(
  skills: readonly EmbeddingSkill[],
  preferences: StudentPreferences
): string {
  const describedSkills = skills.map((skill) =>
    typeof skill === "string" ? skill : `${skill.name} (${skill.proficiency})`
  );
  const sections = [
    describedSkills.length > 0 ? `Skills: ${describedSkills.join(", ")}` : "",
    preferences.interests ? `Interests: ${preferences.interests}` : "",
    preferences.careerPreferences.length > 0
      ? `Career preferences: ${preferences.careerPreferences.join(", ")}`
      : "",
  ];
  return sections.filter(Boolean).join("\n");
}

export function buildOpportunityEmbeddingText(
  opportunity: OpportunitySemanticSource
): string {
  return [
    `Title: ${opportunity.title}`,
    `Job type: ${opportunity.type}`,
    `Company: ${opportunity.company_name}`,
    `Industry: ${opportunity.industry}`,
    opportunity.description
      ? `Description: ${opportunity.description}`
      : "",
    opportunity.required_skills.length > 0
      ? `Required skills: ${opportunity.required_skills.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function hashEmbeddingSource(text: string): string {
  return createHash("sha256")
    .update(`${SEMANTIC_MODEL_NAME}@${SEMANTIC_MODEL_REVISION}\n${text}`, "utf8")
    .digest("hex");
}

export function isSemanticEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === SEMANTIC_VECTOR_DIMENSIONS &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[]
): number {
  if (!isSemanticEmbedding(left) || !isSemanticEmbedding(right)) {
    throw new TypeError("Cosine similarity requires two valid 384-dimensional vectors.");
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < SEMANTIC_VECTOR_DIMENSIONS; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  const score =
    dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
  return Math.max(-1, Math.min(1, score));
}

export function isOpportunityEligible(
  opportunity: { deadline: string; min_gpa: number | null },
  studentGpa: number,
  currentDate: string
): boolean {
  return (
    opportunity.deadline >= currentDate &&
    (opportunity.min_gpa === null || opportunity.min_gpa <= studentGpa)
  );
}

export function rankSemanticOpportunities(
  studentEmbedding: readonly number[],
  opportunities: readonly SemanticOpportunity[],
  limit = 10
): Array<Omit<SemanticOpportunity, "embedding"> & { similarity: number }> {
  return opportunities
    .map(({ embedding, ...opportunity }) => ({
      ...opportunity,
      similarity: cosineSimilarity(studentEmbedding, embedding),
    }))
    .filter((opportunity) => opportunity.similarity > 0)
    .sort(
      (left, right) =>
        right.similarity - left.similarity || left.opp_id - right.opp_id
    )
    .slice(0, limit)
    .map((opportunity) => ({
      ...opportunity,
      similarity: Number(opportunity.similarity.toFixed(6)),
    }));
}

export async function generateSemanticEmbeddings(
  texts: readonly string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (
    texts.length > MAX_EMBEDDING_BATCH_SIZE ||
    texts.some(
      (text) =>
        typeof text !== "string" ||
        text.trim().length === 0 ||
        text.length > MAX_EMBEDDING_TEXT_LENGTH
    )
  ) {
    throw new Error("Embedding input is empty, too large, or invalid.");
  }

  const endpointValue =
    process.env.SEMANTIC_EMBEDDING_URL?.trim() ||
    "http://127.0.0.1:8008/embed";
  const endpointUrl = new URL(endpointValue);
  const token = process.env.SEMANTIC_EMBEDDING_TOKEN?.trim();
  const loopback =
    endpointUrl.hostname === "127.0.0.1" ||
    endpointUrl.hostname === "localhost" ||
    endpointUrl.hostname === "[::1]";
  if (!loopback && (endpointUrl.protocol !== "https:" || !token)) {
    throw new Error(
      "Remote embedding services require HTTPS and SEMANTIC_EMBEDDING_TOKEN."
    );
  }

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error("The semantic embedding service returned an error.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The semantic embedding service returned invalid JSON.");
  }

  if (
    !isRecord(payload) ||
    payload.model !== SEMANTIC_MODEL_NAME ||
    payload.revision !== SEMANTIC_MODEL_REVISION ||
    !Array.isArray(payload.embeddings) ||
    payload.embeddings.length !== texts.length ||
    !payload.embeddings.every(isSemanticEmbedding)
  ) {
    throw new Error("The semantic embedding service returned invalid vectors.");
  }

  return payload.embeddings;
}
