-- Additive storage for real sentence embeddings. This script does not use pgvector.
BEGIN;

CREATE TABLE IF NOT EXISTS public.opportunity_semantic_content (
    opp_id integer PRIMARY KEY
        REFERENCES public.opportunities (opp_id) ON DELETE CASCADE,
    description text,
    required_skills text[] NOT NULL DEFAULT ARRAY[]::text[],
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT opportunity_semantic_content_skills_limit
        CHECK (cardinality(required_skills) <= 100)
);

CREATE TABLE IF NOT EXISTS public.opportunity_semantic_embeddings (
    opp_id integer PRIMARY KEY
        REFERENCES public.opportunities (opp_id) ON DELETE CASCADE,
    model_name text NOT NULL
        CHECK (model_name = 'sentence-transformers/all-MiniLM-L6-v2'),
    model_revision text NOT NULL
        CHECK (model_revision = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'),
    source_hash text NOT NULL
        CHECK (length(source_hash) = 64 AND source_hash ~ '^[0-9a-f]{64}$'),
    embedding real[] NOT NULL,
    generated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT opportunity_semantic_embeddings_dimensions
        CHECK (
            COALESCE(array_ndims(embedding), 0) = 1
            AND cardinality(embedding) = 384
        ),
    CONSTRAINT opportunity_semantic_embeddings_finite
        CHECK (
            array_position(embedding, NULL::real) IS NULL
            AND array_position(embedding, 'NaN'::real) IS NULL
            AND array_position(embedding, 'Infinity'::real) IS NULL
            AND array_position(embedding, '-Infinity'::real) IS NULL
        )
);

CREATE TABLE IF NOT EXISTS public.student_semantic_embeddings (
    student_id integer PRIMARY KEY
        REFERENCES public.students (student_id) ON DELETE CASCADE,
    model_name text NOT NULL
        CHECK (model_name = 'sentence-transformers/all-MiniLM-L6-v2'),
    model_revision text NOT NULL
        CHECK (model_revision = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'),
    source_hash text NOT NULL
        CHECK (length(source_hash) = 64 AND source_hash ~ '^[0-9a-f]{64}$'),
    embedding real[] NOT NULL,
    generated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT student_semantic_embeddings_dimensions
        CHECK (
            COALESCE(array_ndims(embedding), 0) = 1
            AND cardinality(embedding) = 384
        ),
    CONSTRAINT student_semantic_embeddings_finite
        CHECK (
            array_position(embedding, NULL::real) IS NULL
            AND array_position(embedding, 'NaN'::real) IS NULL
            AND array_position(embedding, 'Infinity'::real) IS NULL
            AND array_position(embedding, '-Infinity'::real) IS NULL
        )
);

COMMIT;
