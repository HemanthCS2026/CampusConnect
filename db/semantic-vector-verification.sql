-- Read-only checks for the semantic embedding tables and their vector dimensions.
BEGIN TRANSACTION READ ONLY;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'opportunity_semantic_content',
      'opportunity_semantic_embeddings',
      'student_semantic_embeddings'
  )
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

SELECT
    'opportunity' AS embedding_kind,
    count(*) AS stored_vectors,
    count(*) FILTER (
        WHERE array_ndims(embedding) = 1
          AND cardinality(embedding) = 384
    ) AS valid_dimension_vectors,
    count(*) FILTER (
        WHERE model_name <> 'sentence-transformers/all-MiniLM-L6-v2'
           OR model_revision <> '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
    ) AS unexpected_model_vectors
FROM public.opportunity_semantic_embeddings
UNION ALL
SELECT
    'student' AS embedding_kind,
    count(*) AS stored_vectors,
    count(*) FILTER (
        WHERE array_ndims(embedding) = 1
          AND cardinality(embedding) = 384
    ) AS valid_dimension_vectors,
    count(*) FILTER (
        WHERE model_name <> 'sentence-transformers/all-MiniLM-L6-v2'
           OR model_revision <> '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
    ) AS unexpected_model_vectors
FROM public.student_semantic_embeddings;

-- This sample shows opportunity metadata and stored vector dimensions,
-- never student identifiers or vector contents.
SELECT
    o.opp_id,
    o.title,
    e.model_name,
    e.generated_at,
    cardinality(e.embedding) AS dimensions
FROM public.opportunity_semantic_embeddings AS e
JOIN public.opportunities AS o
  ON o.opp_id = e.opp_id
ORDER BY o.opp_id
LIMIT 10;

ROLLBACK;
