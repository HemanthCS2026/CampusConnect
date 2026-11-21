--
-- PostgreSQL database dump
--

\restrict 37mHcoyED5f9tTQ30hPpfwjdmUSNRYN7BCYBa5r2lWp3x3v6QG3YdWbqb3pRBje

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fn_validate_placement_offer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_placement_offer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    offer_status VARCHAR(20);
BEGIN
    SELECT status
    INTO offer_status
    FROM offers
    WHERE offer_id = NEW.offer_id;

    IF offer_status IS DISTINCT FROM 'Accepted' THEN
        RAISE EXCEPTION
            'A placement can only be created for an accepted offer.';
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: fn_validate_student_gpa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_student_gpa() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.gpa < 0 OR NEW.gpa > 10 THEN
        RAISE EXCEPTION
            'GPA must be between 0 and 10. Received: %',
            NEW.gpa;
    END IF;

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    app_id integer NOT NULL,
    student_id integer NOT NULL,
    opp_id integer NOT NULL,
    applied_date date DEFAULT CURRENT_DATE NOT NULL,
    status character varying(20) DEFAULT 'Applied'::character varying NOT NULL,
    resume_url character varying(255),
    CONSTRAINT applications_status_check CHECK (((status)::text = ANY ((ARRAY['Applied'::character varying, 'Interviewing'::character varying, 'Rejected'::character varying, 'Selected'::character varying])::text[])))
);


--
-- Name: applications_app_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.applications_app_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: applications_app_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.applications_app_id_seq OWNED BY public.applications.app_id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    company_id integer NOT NULL,
    company_name character varying(100) NOT NULL,
    industry character varying(100) NOT NULL
);


--
-- Name: companies_company_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.companies_company_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: companies_company_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.companies_company_id_seq OWNED BY public.companies.company_id;


--
-- Name: company_reps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_reps (
    rep_id integer NOT NULL,
    company_id integer NOT NULL,
    user_id integer NOT NULL,
    name character varying(100) NOT NULL
);


--
-- Name: company_reps_rep_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.company_reps_rep_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_reps_rep_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.company_reps_rep_id_seq OWNED BY public.company_reps.rep_id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    dept_id integer NOT NULL,
    dept_name character varying(100) NOT NULL
);


--
-- Name: departments_dept_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_dept_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_dept_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_dept_id_seq OWNED BY public.departments.dept_id;


--
-- Name: interviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interviews (
    interview_id integer NOT NULL,
    app_id integer NOT NULL,
    interview_date timestamp without time zone NOT NULL,
    type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'Scheduled'::character varying NOT NULL,
    feedback text,
    CONSTRAINT interviews_status_check CHECK (((status)::text = ANY ((ARRAY['Scheduled'::character varying, 'Completed'::character varying, 'Cancelled'::character varying])::text[])))
);


--
-- Name: interviews_interview_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.interviews_interview_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: interviews_interview_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.interviews_interview_id_seq OWNED BY public.interviews.interview_id;


--
-- Name: offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offers (
    offer_id integer NOT NULL,
    app_id integer NOT NULL,
    offer_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    CONSTRAINT offers_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT offers_status_check CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Accepted'::character varying, 'Rejected'::character varying])::text[])))
);


--
-- Name: offers_offer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offers_offer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offers_offer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offers_offer_id_seq OWNED BY public.offers.offer_id;


--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunities (
    opp_id integer NOT NULL,
    company_id integer NOT NULL,
    title character varying(100) NOT NULL,
    type character varying(20) NOT NULL,
    salary numeric(12,2),
    deadline date NOT NULL,
    min_gpa numeric(4,2),
    CONSTRAINT opportunities_min_gpa_check CHECK (((min_gpa >= (0)::numeric) AND (min_gpa <= (10)::numeric))),
    CONSTRAINT opportunities_salary_check CHECK ((salary >= (0)::numeric)),
    CONSTRAINT opportunities_type_check CHECK (((type)::text = ANY ((ARRAY['Placement'::character varying, 'Internship'::character varying])::text[])))
);


--
-- Name: opportunities_opp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opportunities_opp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opportunities_opp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opportunities_opp_id_seq OWNED BY public.opportunities.opp_id;


--
-- Name: placements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.placements (
    placement_id integer NOT NULL,
    offer_id integer NOT NULL,
    joining_date date,
    status character varying(20) DEFAULT 'Pending Joining'::character varying NOT NULL,
    CONSTRAINT placements_status_check CHECK (((status)::text = ANY ((ARRAY['Pending Joining'::character varying, 'Joined'::character varying, 'Withdrawn'::character varying])::text[])))
);


--
-- Name: placements_placement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.placements_placement_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: placements_placement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.placements_placement_id_seq OWNED BY public.placements.placement_id;


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    student_id integer NOT NULL,
    user_id integer NOT NULL,
    dept_id integer NOT NULL,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    gpa numeric(4,2) NOT NULL,
    graduation_year integer NOT NULL,
    CONSTRAINT students_gpa_check CHECK (((gpa >= (0)::numeric) AND (gpa <= (10)::numeric))),
    CONSTRAINT students_graduation_year_check CHECK ((graduation_year >= 2000))
);


--
-- Name: students_student_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.students_student_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: students_student_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.students_student_id_seq OWNED BY public.students.student_id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['Student'::character varying, 'CompanyRep'::character varying, 'Admin'::character varying])::text[])))
);


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: vw_interview_schedule; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_interview_schedule AS
 SELECT i.interview_id,
    i.interview_date,
    i.type AS interview_type,
    i.status AS interview_status,
    s.student_id,
    s.first_name,
    s.last_name,
    o.title AS opportunity_title,
    i.feedback
   FROM (((public.interviews i
     JOIN public.applications a ON ((i.app_id = a.app_id)))
     JOIN public.students s ON ((a.student_id = s.student_id)))
     JOIN public.opportunities o ON ((a.opp_id = o.opp_id)));


--
-- Name: vw_placement_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_placement_report AS
 SELECT p.placement_id,
    p.joining_date,
    p.status AS placement_status,
    s.student_id,
    s.first_name,
    s.last_name,
    c.company_name,
    o.title AS opportunity_title,
    o.type AS opportunity_type,
    f.amount AS offer_amount
   FROM (((((public.placements p
     JOIN public.offers f ON ((p.offer_id = f.offer_id)))
     JOIN public.applications a ON ((f.app_id = a.app_id)))
     JOIN public.students s ON ((a.student_id = s.student_id)))
     JOIN public.opportunities o ON ((a.opp_id = o.opp_id)))
     JOIN public.companies c ON ((o.company_id = c.company_id)));


--
-- Name: vw_student_applications; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_student_applications AS
 SELECT s.student_id,
    s.first_name,
    s.last_name,
    u.username,
    d.dept_name,
    o.opp_id,
    o.title AS opportunity_title,
    o.type AS opportunity_type,
    a.app_id,
    a.applied_date,
    a.status AS application_status
   FROM ((((public.students s
     JOIN public.users u ON ((s.user_id = u.user_id)))
     JOIN public.departments d ON ((s.dept_id = d.dept_id)))
     JOIN public.applications a ON ((s.student_id = a.student_id)))
     JOIN public.opportunities o ON ((a.opp_id = o.opp_id)));


--
-- Name: applications app_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications ALTER COLUMN app_id SET DEFAULT nextval('public.applications_app_id_seq'::regclass);


--
-- Name: companies company_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies ALTER COLUMN company_id SET DEFAULT nextval('public.companies_company_id_seq'::regclass);


--
-- Name: company_reps rep_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_reps ALTER COLUMN rep_id SET DEFAULT nextval('public.company_reps_rep_id_seq'::regclass);


--
-- Name: departments dept_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN dept_id SET DEFAULT nextval('public.departments_dept_id_seq'::regclass);


--
-- Name: interviews interview_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews ALTER COLUMN interview_id SET DEFAULT nextval('public.interviews_interview_id_seq'::regclass);


--
-- Name: offers offer_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers ALTER COLUMN offer_id SET DEFAULT nextval('public.offers_offer_id_seq'::regclass);


--
-- Name: opportunities opp_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities ALTER COLUMN opp_id SET DEFAULT nextval('public.opportunities_opp_id_seq'::regclass);


--
-- Name: placements placement_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placements ALTER COLUMN placement_id SET DEFAULT nextval('public.placements_placement_id_seq'::regclass);


--
-- Name: students student_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students ALTER COLUMN student_id SET DEFAULT nextval('public.students_student_id_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (app_id);


--
-- Name: applications applications_student_id_opp_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_student_id_opp_id_key UNIQUE (student_id, opp_id);


--
-- Name: companies companies_company_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_company_name_key UNIQUE (company_name);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (company_id);


--
-- Name: company_reps company_reps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_reps
    ADD CONSTRAINT company_reps_pkey PRIMARY KEY (rep_id);


--
-- Name: company_reps company_reps_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_reps
    ADD CONSTRAINT company_reps_user_id_key UNIQUE (user_id);


--
-- Name: departments departments_dept_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_dept_name_key UNIQUE (dept_name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (dept_id);


--
-- Name: interviews interviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_pkey PRIMARY KEY (interview_id);


--
-- Name: offers offers_app_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_app_id_key UNIQUE (app_id);


--
-- Name: offers offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_pkey PRIMARY KEY (offer_id);


--
-- Name: opportunities opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (opp_id);


--
-- Name: placements placements_offer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placements
    ADD CONSTRAINT placements_offer_id_key UNIQUE (offer_id);


--
-- Name: placements placements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placements
    ADD CONSTRAINT placements_pkey PRIMARY KEY (placement_id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (student_id);


--
-- Name: students students_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_key UNIQUE (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_applications_opp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_opp_id ON public.applications USING btree (opp_id);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status ON public.applications USING btree (status);


--
-- Name: idx_applications_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_student_id ON public.applications USING btree (student_id);


--
-- Name: idx_company_reps_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_reps_company_id ON public.company_reps USING btree (company_id);


--
-- Name: idx_interviews_app_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interviews_app_id ON public.interviews USING btree (app_id);


--
-- Name: idx_interviews_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interviews_date ON public.interviews USING btree (interview_date);


--
-- Name: idx_offers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offers_status ON public.offers USING btree (status);


--
-- Name: idx_opportunities_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_company_id ON public.opportunities USING btree (company_id);


--
-- Name: idx_opportunities_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_deadline ON public.opportunities USING btree (deadline);


--
-- Name: idx_placements_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_placements_status ON public.placements USING btree (status);


--
-- Name: idx_students_dept_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_dept_id ON public.students USING btree (dept_id);


--
-- Name: placements trg_validate_placement_offer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_placement_offer BEFORE INSERT OR UPDATE OF offer_id ON public.placements FOR EACH ROW EXECUTE FUNCTION public.fn_validate_placement_offer();


--
-- Name: students trg_validate_student_gpa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_student_gpa BEFORE INSERT OR UPDATE OF gpa ON public.students FOR EACH ROW EXECUTE FUNCTION public.fn_validate_student_gpa();


--
-- Name: applications applications_opp_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_opp_id_fkey FOREIGN KEY (opp_id) REFERENCES public.opportunities(opp_id);


--
-- Name: applications applications_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id);


--
-- Name: company_reps company_reps_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_reps
    ADD CONSTRAINT company_reps_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: company_reps company_reps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_reps
    ADD CONSTRAINT company_reps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- Name: interviews interviews_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interviews
    ADD CONSTRAINT interviews_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.applications(app_id);


--
-- Name: offers offers_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offers
    ADD CONSTRAINT offers_app_id_fkey FOREIGN KEY (app_id) REFERENCES public.applications(app_id);


--
-- Name: opportunities opportunities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id);


--
-- Name: placements placements_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.placements
    ADD CONSTRAINT placements_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(offer_id);


--
-- Name: students students_dept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.departments(dept_id);


--
-- Name: students students_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict 37mHcoyED5f9tTQ30hPpfwjdmUSNRYN7BCYBa5r2lWp3x3v6QG3YdWbqb3pRBje

