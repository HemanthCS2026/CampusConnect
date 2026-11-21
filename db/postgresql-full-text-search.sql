-- Add GIN expression indexes for the text fields used by the search API.
-- These expressions must stay aligned with the route's WHERE predicates.
CREATE INDEX IF NOT EXISTS idx_opportunities_search_gin
    ON public.opportunities
    USING gin (
        to_tsvector(
            'english',
            coalesce(title, '') || ' ' || coalesce(type, '')
        )
    );

CREATE INDEX IF NOT EXISTS idx_companies_search_gin
    ON public.companies
    USING gin (
        to_tsvector(
            'english',
            coalesce(company_name, '') || ' ' || coalesce(industry, '')
        )
    );
