type CompanyQuery = {
  text: string;
  values: [number];
};

export const companyOpportunitiesSql = `
  WITH representative_company AS (
    SELECT rep.company_id, company.company_name
    FROM public.company_reps AS rep
    JOIN public.companies AS company
      ON company.company_id = rep.company_id
    WHERE rep.user_id = $1
  )
  SELECT
    representative_company.company_id,
    representative_company.company_name,
    opportunity.opp_id,
    opportunity.title,
    opportunity.type,
    opportunity.salary,
    opportunity.deadline::text AS deadline,
    opportunity.min_gpa
  FROM representative_company
  LEFT JOIN public.opportunities AS opportunity
    ON opportunity.company_id = representative_company.company_id
  ORDER BY opportunity.opp_id
`;

export const companyApplicationsSql = `
  SELECT
    application.app_id,
    concat_ws(' ', student.first_name, student.last_name) AS student_name,
    department.dept_name AS department_name,
    student.gpa::text AS gpa,
    student.graduation_year,
    opportunity.title AS opportunity_title,
    application.applied_date::text AS applied_date,
    application.status
  FROM public.applications AS application
  JOIN public.students AS student
    ON student.student_id = application.student_id
  JOIN public.departments AS department
    ON department.dept_id = student.dept_id
  JOIN public.opportunities AS opportunity
    ON opportunity.opp_id = application.opp_id
  JOIN public.company_reps AS rep
    ON rep.company_id = opportunity.company_id
  WHERE rep.user_id = $1
  ORDER BY application.applied_date DESC, application.app_id DESC
`;

export function companyDashboardQueries(userId: number): {
  opportunities: CompanyQuery;
  applications: CompanyQuery;
} {
  return {
    opportunities: {
      text: companyOpportunitiesSql,
      values: [userId],
    },
    applications: {
      text: companyApplicationsSql,
      values: [userId],
    },
  };
}
