-- Read-only verification for the CampusConnect full-text search indexes.
BEGIN TRANSACTION READ ONLY;

SELECT indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
      'idx_opportunities_search_gin',
      'idx_companies_search_gin'
  )
ORDER BY indexname;

-- Example ranked search. An empty result is valid when no row matches.
WITH search_query AS (
    SELECT websearch_to_tsquery('english', 'software internship') AS tsquery
)
SELECT
    o.opp_id,
    c.company_name,
    o.title,
    o.type,
    ts_rank(
        setweight(to_tsvector('english', coalesce(o.title, '')), 'A')
        || setweight(to_tsvector('english', coalesce(c.company_name, '')), 'B')
        || setweight(to_tsvector('english', coalesce(c.industry, '')), 'B')
        || setweight(to_tsvector('english', coalesce(o.type, '')), 'C'),
        search_query.tsquery
    ) AS relevance
FROM public.opportunities AS o
JOIN public.companies AS c
  ON c.company_id = o.company_id
CROSS JOIN search_query
WHERE (
      to_tsvector(
          'english',
          coalesce(o.title, '') || ' ' || coalesce(o.type, '')
      ) @@ search_query.tsquery
      OR to_tsvector(
          'english',
          coalesce(c.company_name, '') || ' ' || coalesce(c.industry, '')
      ) @@ search_query.tsquery
  )
ORDER BY relevance DESC, o.deadline ASC, o.opp_id ASC
LIMIT 10;

ROLLBACK;


