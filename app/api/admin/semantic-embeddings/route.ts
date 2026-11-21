import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSessionUser, requireRole } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { readBoundedRequestBody } from "@/lib/request-body";
import {
  buildOpportunityEmbeddingText,
  generateSemanticEmbeddings,
  hashEmbeddingSource,
  SEMANTIC_MODEL_NAME,
  SEMANTIC_MODEL_REVISION,
  type OpportunitySemanticSource,
} from "@/lib/semantic-search";

type OpportunityEmbeddingSource = OpportunitySemanticSource & {
  opp_id: number;
  source_hash: string | null;
  model_name: string | null;
  model_revision: string | null;
};

type OpportunityContentUpdate = {
  oppId: number;
  description: string | null;
  requiredSkills: string[];
};

const MAX_REQUEST_BYTES = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContentUpdate(
  body: unknown
): { update: OpportunityContentUpdate | null } | { error: string } {
  if (!isRecord(body)) return { error: "Request body must be an object." };

  const keys = Object.keys(body);
  if (keys.length === 0) return { update: null };
  if (
    keys.some(
      (key) =>
        key !== "opp_id" &&
        key !== "description" &&
        key !== "required_skills"
    ) ||
    !Number.isInteger(body.opp_id) ||
    typeof body.opp_id !== "number" ||
    body.opp_id < 1 ||
    body.opp_id > 2_147_483_647 ||
    (body.description !== null && typeof body.description !== "string") ||
    (typeof body.description === "string" &&
      (body.description.length > 10_000 ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(
          body.description
        ))) ||
    !Array.isArray(body.required_skills) ||
    body.required_skills.length > 100
  ) {
    return {
      error:
        "Provide opp_id, an optional description (up to 10000 characters), and up to 100 required_skills.",
    };
  }

  const requiredSkills: string[] = [];
  const seen = new Set<string>();
  for (const candidate of body.required_skills) {
    if (
      typeof candidate !== "string" ||
      candidate.length > 80 ||
      /[\u0000-\u001F\u007F]/.test(candidate)
    ) {
      return { error: "Each required skill must be a valid string of at most 80 characters." };
    }

    const skill = candidate.normalize("NFC").trim().replace(/\s+/g, " ");
    const normalized = skill.toLowerCase();
    if (!skill || seen.has(normalized)) {
      return {
        error: "Required skills must be non-empty and unique after normalization.",
      };
    }
    requiredSkills.push(skill);
    seen.add(normalized);
  }

  return {
    update: {
      oppId: body.opp_id,
      description:
        typeof body.description === "string"
          ? body.description.trim()
          : null,
      requiredSkills,
    },
  };
}

export async function POST(request: Request) {
  const sessionUser = getSessionUser(request);
  try {
    requireRole(sessionUser, ["Admin"]);
  } catch {
    return NextResponse.json(
      { success: false, message: "Administrator access required." },
      { status: sessionUser ? 403 : 401 }
    );
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, message: "Cross-origin embedding updates are not allowed." },
      { status: 403 }
    );
  }

  let opportunityId: number | null = null;
  let bodyText: string | null;
  try {
    bodyText = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
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

  let contentUpdate: OpportunityContentUpdate | null = null;
  if (bodyText.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { success: false, message: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    const parsedBody = parseContentUpdate(body);
    if ("error" in parsedBody) {
      return NextResponse.json(
        { success: false, message: parsedBody.error },
        { status: 400 }
      );
    }
    contentUpdate = parsedBody.update;
    opportunityId = contentUpdate?.oppId ?? null;
  }

  if (contentUpdate) {
    try {
      const opportunity = await pool.query(
        `SELECT 1 FROM public.opportunities WHERE opp_id = $1`,
        [contentUpdate.oppId]
      );
      if (opportunity.rowCount === 0) {
        return NextResponse.json(
          { success: false, message: "Opportunity not found." },
          { status: 404 }
        );
      }

      await pool.query(
        `INSERT INTO public.opportunity_semantic_content
           (opp_id, description, required_skills, updated_at)
         VALUES ($1, $2, $3::text[], CURRENT_TIMESTAMP)
         ON CONFLICT (opp_id) DO UPDATE
         SET description = EXCLUDED.description,
             required_skills = EXCLUDED.required_skills,
             updated_at = EXCLUDED.updated_at`,
        [
          contentUpdate.oppId,
          contentUpdate.description,
          contentUpdate.requiredSkills,
        ]
      );
    } catch {
      console.error("Semantic opportunity content could not be saved.");
      return NextResponse.json(
        {
          success: false,
          message:
            "Opportunity content storage is unavailable. Apply db/semantic-vector-search.sql first.",
        },
        { status: 503 }
      );
    }
  }

  let sources: OpportunityEmbeddingSource[];
  try {
    const result = await pool.query<OpportunityEmbeddingSource>(
      `SELECT
         o.opp_id,
         o.title,
         o.type,
         c.company_name,
         c.industry,
         content.description,
         COALESCE(content.required_skills, ARRAY[]::text[]) AS required_skills,
         embeddings.source_hash,
         embeddings.model_name,
         embeddings.model_revision
       FROM public.opportunities AS o
       JOIN public.companies AS c
         ON c.company_id = o.company_id
       LEFT JOIN public.opportunity_semantic_content AS content
         ON content.opp_id = o.opp_id
       LEFT JOIN public.opportunity_semantic_embeddings AS embeddings
         ON embeddings.opp_id = o.opp_id
       WHERE ($1::integer IS NULL OR o.opp_id = $1)
       ORDER BY o.opp_id`,
      [opportunityId]
    );
    sources = result.rows;
  } catch {
    console.error("Semantic opportunity sources could not be loaded.");
    return NextResponse.json(
      {
        success: false,
        message:
          "Semantic embedding storage is unavailable. Apply db/semantic-vector-search.sql first.",
      },
      { status: 503 }
    );
  }

  const staleSources = sources
    .map((source) => {
      const text = buildOpportunityEmbeddingText(source);
      return { source, text, sourceHash: hashEmbeddingSource(text) };
    })
    .filter(
      ({ source, sourceHash }) =>
        source.source_hash !== sourceHash ||
        source.model_name !== SEMANTIC_MODEL_NAME ||
        source.model_revision !== SEMANTIC_MODEL_REVISION
    );

  let generated = 0;
  try {
    for (let offset = 0; offset < staleSources.length; offset += 32) {
      const batch = staleSources.slice(offset, offset + 32);
      const vectors = await generateSemanticEmbeddings(
        batch.map((item) => item.text)
      );

      for (let index = 0; index < batch.length; index += 1) {
        const item = batch[index];
        const embedding = vectors[index];
        if (!item || !embedding) {
          throw new Error("Embedding service returned an incomplete batch.");
        }

        await pool.query(
          `INSERT INTO public.opportunity_semantic_embeddings
             (opp_id, model_name, model_revision, source_hash, embedding, generated_at)
           VALUES ($1, $2, $3, $4, $5::real[], CURRENT_TIMESTAMP)
           ON CONFLICT (opp_id) DO UPDATE
           SET model_name = EXCLUDED.model_name,
               model_revision = EXCLUDED.model_revision,
               source_hash = EXCLUDED.source_hash,
               embedding = EXCLUDED.embedding,
               generated_at = EXCLUDED.generated_at`,
          [
            item.source.opp_id,
            SEMANTIC_MODEL_NAME,
            SEMANTIC_MODEL_REVISION,
            item.sourceHash,
            embedding,
          ]
        );
        generated += 1;
      }
    }
  } catch {
    console.error("Semantic opportunity embedding generation failed.");
    return NextResponse.json(
      {
        success: false,
        message:
          "Embedding generation failed. Start the local semantic embedding service and retry.",
        generated,
        contentUpdated: Boolean(contentUpdate),
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    success: true,
    model: SEMANTIC_MODEL_NAME,
    revision: SEMANTIC_MODEL_REVISION,
    examined: sources.length,
    generated,
    unchanged: sources.length - generated,
    contentUpdated: Boolean(contentUpdate),
  });
}
