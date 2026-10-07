/* =====================================================================================================================
   Pursuits — tables for Azure SQL Database (T-SQL)
   Target: supply-chain-capability-dev-supplychaindev-mssql-db

   Everything is created in its own schema, [pursuits], so nothing collides with the tables already in this
   database. Safe to run more than once: a table that already exists is left as it is; nothing is dropped.

   Run in SSMS / Azure Data Studio connected to the database above (New Query → paste → Execute).

   Groups
     1. Dimensions       dim_client, dim_employee, dim_skill
     2. Facts            opportunities, opportunities_added, requirements, requirements_added, allocations,
                         employee_skills, assignments
     3. App changes      opportunity_edits, opportunity_times, requirement_edits, requirements_deleted,
                         skill_edits, skill_reviews
     4. Audit & system   audit_log, meta, data_sources, data_quality, skill_only_employees
   ===================================================================================================================== */

SET XACT_ABORT ON;
GO

IF SCHEMA_ID(N'pursuits') IS NULL EXEC (N'CREATE SCHEMA pursuits AUTHORIZATION dbo');
GO

/* ---------------------------------------------------------------------------------------------------------------------
   1. DIMENSIONS
   --------------------------------------------------------------------------------------------------------------------- */

-- Every client / account the app knows. New names typed in "Add opportunity" are added here (CL-0NN).
IF OBJECT_ID(N'pursuits.dim_client', N'U') IS NULL
CREATE TABLE pursuits.dim_client (
    id          NVARCHAR(10)   NOT NULL CONSTRAINT PK_dim_client PRIMARY KEY,           -- CL-001 …
    name        NVARCHAR(80)   NOT NULL CONSTRAINT UQ_dim_client_name UNIQUE,
    source      NVARCHAR(12)   NOT NULL CONSTRAINT CK_dim_client_source CHECK (source IN (N'opportunity', N'allocation', N'app')),
    created_at  DATETIME2(3)   NOT NULL CONSTRAINT DF_dim_client_created DEFAULT SYSUTCDATETIME()
);
GO

-- Employee master. Lead and "Add rating" pick from here. name is empty until names are loaded.
IF OBJECT_ID(N'pursuits.dim_employee', N'U') IS NULL
CREATE TABLE pursuits.dim_employee (
    code          NVARCHAR(20)  NOT NULL CONSTRAINT PK_dim_employee PRIMARY KEY,         -- e.g. F16605
    name          NVARCHAR(120) NULL,
    title         NVARCHAR(80)  NOT NULL,                                                -- designation
    grade         TINYINT       NOT NULL,
    joining_date  DATE          NULL,
    status        NVARCHAR(30)  NOT NULL CONSTRAINT DF_dim_employee_status DEFAULT N'Active',
    provenance    NVARCHAR(12)  NOT NULL CONSTRAINT CK_dim_employee_prov CHECK (provenance IN (N'source', N'derived', N'synthetic', N'app'))
);
GO

-- Skill catalogue = the columns of the skills matrix, in three mutually exclusive sections.
IF OBJECT_ID(N'pursuits.dim_skill', N'U') IS NULL
CREATE TABLE pursuits.dim_skill (
    skill       NVARCHAR(60)  NOT NULL CONSTRAINT PK_dim_skill PRIMARY KEY,
    category    NVARCHAR(20)  NOT NULL CONSTRAINT CK_dim_skill_category CHECK (category IN (N'Supply Chain', N'Data Science', N'FDE')),
    family      NVARCHAR(80)  NOT NULL,                                                  -- groups related skills for matching
    source      NVARCHAR(10)  NOT NULL CONSTRAINT CK_dim_skill_source CHECK (source IN (N'catalog', N'app')),
    created_at  DATETIME2(3)  NOT NULL CONSTRAINT DF_dim_skill_created DEFAULT SYSUTCDATETIME()
);
GO

/* ---------------------------------------------------------------------------------------------------------------------
   2. FACTS
   --------------------------------------------------------------------------------------------------------------------- */

-- Opportunities imported from the tracker. Columns are shared with opportunities_added (created in the app).
IF OBJECT_ID(N'pursuits.opportunities', N'U') IS NULL
CREATE TABLE pursuits.opportunities (
    id                 NVARCHAR(20)   NOT NULL CONSTRAINT PK_opportunities PRIMARY KEY,   -- OPP-001, OPPX-101 …
    sno                INT            NULL,
    account            NVARCHAR(80)   NOT NULL,                                          -- client name (dim_client.name)
    name               NVARCHAR(120)  NOT NULL,
    type               NVARCHAR(40)   NOT NULL,                                          -- Fixed Bid, T&M, Product, Outcome Based, Output Based
    stage              NVARCHAR(40)   NOT NULL,
    proposal_date      DATE           NULL,
    est_start_date     DATE           NULL,
    months             SMALLINT       NULL CONSTRAINT CK_opportunities_months CHECK (months BETWEEN 1 AND 60),
    value              DECIMAL(18,2)  NULL CONSTRAINT CK_opportunities_value CHECK (value >= 0),
    conf_winning       DECIMAL(5,4)   NULL CONSTRAINT CK_opportunities_win CHECK (conf_winning BETWEEN 0 AND 1),
    conf_this_quarter  DECIMAL(5,4)   NULL,
    conf_next_quarter  DECIMAL(5,4)   NULL,
    status             NVARCHAR(300)  NOT NULL CONSTRAINT DF_opportunities_status DEFAULT N'',   -- description
    lead               NVARCHAR(80)   NULL,                                              -- dim_employee.code
    outcome            NVARCHAR(4)    NOT NULL CONSTRAINT CK_opportunities_outcome CHECK (outcome IN (N'open', N'won', N'lost')),
    probability        DECIMAL(5,4)   NOT NULL CONSTRAINT CK_opportunities_prob CHECK (probability BETWEEN 0 AND 1),
    monthly            NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_opportunities_monthly CHECK (ISJSON(monthly) = 1),          -- [{"month":"2026-11","value":52889},…]
    provenance         NVARCHAR(12)   NOT NULL CONSTRAINT CK_opportunities_prov CHECK (provenance IN (N'source', N'derived', N'synthetic', N'app')),
    field_provenance   NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_opportunities_fprov CHECK (ISJSON(field_provenance) = 1),
    notes              NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_opportunities_notes CHECK (ISJSON(notes) = 1)
);
GO

IF OBJECT_ID(N'pursuits.opportunities_added', N'U') IS NULL
CREATE TABLE pursuits.opportunities_added (
    id                 NVARCHAR(20)   NOT NULL CONSTRAINT PK_opportunities_added PRIMARY KEY,   -- OPP-007 …
    sno                INT            NULL,
    account            NVARCHAR(80)   NOT NULL,
    name               NVARCHAR(120)  NOT NULL,
    type               NVARCHAR(40)   NOT NULL,
    stage              NVARCHAR(40)   NOT NULL,
    proposal_date      DATE           NULL,
    est_start_date     DATE           NULL,
    months             SMALLINT       NULL CONSTRAINT CK_opp_added_months CHECK (months BETWEEN 1 AND 60),
    value              DECIMAL(18,2)  NULL CONSTRAINT CK_opp_added_value CHECK (value >= 0),
    conf_winning       DECIMAL(5,4)   NULL CONSTRAINT CK_opp_added_win CHECK (conf_winning BETWEEN 0 AND 1),
    conf_this_quarter  DECIMAL(5,4)   NULL,
    conf_next_quarter  DECIMAL(5,4)   NULL,
    status             NVARCHAR(300)  NOT NULL CONSTRAINT DF_opp_added_status DEFAULT N'',
    lead               NVARCHAR(80)   NULL,
    outcome            NVARCHAR(4)    NOT NULL CONSTRAINT CK_opp_added_outcome CHECK (outcome IN (N'open', N'won', N'lost')),
    probability        DECIMAL(5,4)   NOT NULL CONSTRAINT CK_opp_added_prob CHECK (probability BETWEEN 0 AND 1),
    monthly            NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_opp_added_monthly CHECK (ISJSON(monthly) = 1),
    provenance         NVARCHAR(12)   NOT NULL CONSTRAINT CK_opp_added_prov CHECK (provenance IN (N'source', N'derived', N'synthetic', N'app')),
    field_provenance   NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_opp_added_fprov CHECK (ISJSON(field_provenance) = 1),
    notes              NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_opp_added_notes CHECK (ISJSON(notes) = 1)
);
GO

-- People needed by each imported opportunity.
IF OBJECT_ID(N'pursuits.requirements', N'U') IS NULL
CREATE TABLE pursuits.requirements (
    id              NVARCHAR(40)  NOT NULL CONSTRAINT PK_requirements PRIMARY KEY,       -- OPP-002-R1 …
    opportunity_id  NVARCHAR(20)  NOT NULL CONSTRAINT FK_requirements_opportunity REFERENCES pursuits.opportunities (id),
    role            NVARCHAR(80)  NOT NULL,
    grade           TINYINT       NOT NULL,
    fte             DECIMAL(5,2)  NOT NULL CONSTRAINT CK_requirements_fte CHECK (fte > 0 AND fte <= 10),
    sc_skill        NVARCHAR(60)  NOT NULL,                                               -- dim_skill (Supply Chain)
    tech_skill      NVARCHAR(60)  NOT NULL,                                               -- dim_skill (Data Science / FDE)
    [start]         DATE          NOT NULL,
    [end]           DATE          NOT NULL,
    provenance      NVARCHAR(12)  NOT NULL,
    CONSTRAINT CK_requirements_dates CHECK ([end] >= [start])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_requirements_opportunity' AND object_id = OBJECT_ID(N'pursuits.requirements'))
    CREATE INDEX IX_requirements_opportunity ON pursuits.requirements (opportunity_id);
GO

-- Requirements added in the app (may belong to an app-created opportunity, so no foreign key).
IF OBJECT_ID(N'pursuits.requirements_added', N'U') IS NULL
CREATE TABLE pursuits.requirements_added (
    id              NVARCHAR(40)  NOT NULL CONSTRAINT PK_requirements_added PRIMARY KEY,
    opportunity_id  NVARCHAR(20)  NOT NULL,
    role            NVARCHAR(80)  NOT NULL,
    grade           TINYINT       NOT NULL,
    fte             DECIMAL(5,2)  NOT NULL CONSTRAINT CK_req_added_fte CHECK (fte > 0 AND fte <= 10),
    sc_skill        NVARCHAR(60)  NOT NULL,
    tech_skill      NVARCHAR(60)  NOT NULL,
    [start]         DATE          NOT NULL,
    [end]           DATE          NOT NULL,
    provenance      NVARCHAR(12)  NOT NULL,
    CONSTRAINT CK_req_added_dates CHECK ([end] >= [start])
);
GO

-- Allocation report: who is on which project, when, and at what %.
IF OBJECT_ID(N'pursuits.allocations', N'U') IS NULL
CREATE TABLE pursuits.allocations (
    id                 NVARCHAR(40)   NOT NULL CONSTRAINT PK_allocations PRIMARY KEY,
    employee_code      NVARCHAR(20)   NOT NULL CONSTRAINT FK_allocations_employee REFERENCES pursuits.dim_employee (code),
    project_code       NVARCHAR(60)   NOT NULL,
    project_name       NVARCHAR(200)  NOT NULL,
    client             NVARCHAR(80)   NOT NULL,
    department         NVARCHAR(80)   NOT NULL,
    vertical           NVARCHAR(80)   NOT NULL,
    [start]            DATE           NOT NULL,
    [end]              DATE           NOT NULL,
    pct                DECIMAL(6,2)   NOT NULL,
    project_type       NVARCHAR(40)   NOT NULL,
    report_allocation  NVARCHAR(40)   NOT NULL,
    category           NVARCHAR(60)   NULL,
    sow_status         NVARCHAR(60)   NOT NULL,
    engagement_type    NVARCHAR(60)   NOT NULL,
    kind               NVARCHAR(10)   NOT NULL CONSTRAINT CK_allocations_kind CHECK (kind IN (N'billable', N'internal', N'bench', N'blocked', N'leave')),
    provenance         NVARCHAR(12)   NOT NULL,
    assignment_id      NVARCHAR(40)   NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_allocations_employee' AND object_id = OBJECT_ID(N'pursuits.allocations'))
    CREATE INDEX IX_allocations_employee ON pursuits.allocations (employee_code, [start], [end]);
GO

-- Skills people hold (imported). Ratings changed in the app are in skill_edits.
IF OBJECT_ID(N'pursuits.employee_skills', N'U') IS NULL
CREATE TABLE pursuits.employee_skills (
    id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_employee_skills PRIMARY KEY,
    employee_code  NVARCHAR(20)   NOT NULL,                                              -- dim_employee.code or skill_only_employees.code
    skill          NVARCHAR(60)   NOT NULL,                                              -- dim_skill.skill
    category       NVARCHAR(20)   NOT NULL CONSTRAINT CK_employee_skills_cat CHECK (category IN (N'Supply Chain', N'Data Science', N'FDE')),
    proficiency    TINYINT        NULL CONSTRAINT CK_employee_skills_level CHECK (proficiency BETWEEN 1 AND 4),   -- NULL = not stated in source
    last_updated   DATE           NULL,
    provenance     NVARCHAR(12)   NOT NULL,
    basis          NVARCHAR(400)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_employee_skills_employee' AND object_id = OBJECT_ID(N'pursuits.employee_skills'))
    CREATE INDEX IX_employee_skills_employee ON pursuits.employee_skills (employee_code, skill);
GO

-- Deployment decisions: a person proposed for / confirmed on a requirement.
IF OBJECT_ID(N'pursuits.assignments', N'U') IS NULL
CREATE TABLE pursuits.assignments (
    id              NVARCHAR(40)  NOT NULL CONSTRAINT PK_assignments PRIMARY KEY,
    requirement_id  NVARCHAR(40)  NOT NULL,
    employee_code   NVARCHAR(20)  NOT NULL CONSTRAINT FK_assignments_employee REFERENCES pursuits.dim_employee (code),
    fte             DECIMAL(4,2)  NOT NULL CONSTRAINT CK_assignments_fte CHECK (fte > 0 AND fte <= 1),
    status          NVARCHAR(10)  NOT NULL CONSTRAINT CK_assignments_status CHECK (status IN (N'proposed', N'confirmed')),
    created_at      DATETIME2(3)  NOT NULL,
    updated_at      DATETIME2(3)  NOT NULL,
    CONSTRAINT UQ_assignments_req_emp UNIQUE (requirement_id, employee_code)
);
GO

/* ---------------------------------------------------------------------------------------------------------------------
   3. APP CHANGES  (imported rows are never overwritten; what users change is stored here and applied on read)
   --------------------------------------------------------------------------------------------------------------------- */

-- Saved changes to an opportunity: {"stage":…,"type":…,"estStartDate":…,"months":…,"value":…,"confWinning":…,"lead":…}
IF OBJECT_ID(N'pursuits.opportunity_edits', N'U') IS NULL
CREATE TABLE pursuits.opportunity_edits (
    opportunity_id  NVARCHAR(20)   NOT NULL CONSTRAINT PK_opportunity_edits PRIMARY KEY,
    edit            NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_opportunity_edits_json CHECK (ISJSON(edit) = 1)
);
GO

-- When each opportunity was created and last saved (drives "Updated …" in the top bar).
IF OBJECT_ID(N'pursuits.opportunity_times', N'U') IS NULL
CREATE TABLE pursuits.opportunity_times (
    opportunity_id  NVARCHAR(20)  NOT NULL CONSTRAINT PK_opportunity_times PRIMARY KEY,
    created_at      DATETIME2(3)  NOT NULL,
    modified_at     DATETIME2(3)  NOT NULL,
    CONSTRAINT CK_opportunity_times_order CHECK (modified_at >= created_at)
);
GO

IF OBJECT_ID(N'pursuits.requirement_edits', N'U') IS NULL
CREATE TABLE pursuits.requirement_edits (
    requirement_id  NVARCHAR(40)   NOT NULL CONSTRAINT PK_requirement_edits PRIMARY KEY,
    edit            NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_requirement_edits_json CHECK (ISJSON(edit) = 1)
);
GO

IF OBJECT_ID(N'pursuits.requirements_deleted', N'U') IS NULL
CREATE TABLE pursuits.requirements_deleted (
    requirement_id  NVARCHAR(40)  NOT NULL CONSTRAINT PK_requirements_deleted PRIMARY KEY
);
GO

-- Ratings set in "Skill rating" / "Add rating". 0 = skill removed.
IF OBJECT_ID(N'pursuits.skill_edits', N'U') IS NULL
CREATE TABLE pursuits.skill_edits (
    employee_code  NVARCHAR(20)  NOT NULL,
    skill          NVARCHAR(60)  NOT NULL CONSTRAINT FK_skill_edits_skill REFERENCES pursuits.dim_skill (skill),
    proficiency    TINYINT       NOT NULL CONSTRAINT CK_skill_edits_level CHECK (proficiency BETWEEN 0 AND 4),
    CONSTRAINT PK_skill_edits PRIMARY KEY (employee_code, skill)
);
GO

IF OBJECT_ID(N'pursuits.skill_reviews', N'U') IS NULL
CREATE TABLE pursuits.skill_reviews (
    employee_code  NVARCHAR(20)  NOT NULL CONSTRAINT PK_skill_reviews PRIMARY KEY,
    reviewed_on    DATE          NOT NULL
);
GO

/* ---------------------------------------------------------------------------------------------------------------------
   4. AUDIT & SYSTEM
   --------------------------------------------------------------------------------------------------------------------- */

-- Every save: who (IP, or signed-in name), when, which record, which field, from → to.
IF OBJECT_ID(N'pursuits.audit_log', N'U') IS NULL
CREATE TABLE pursuits.audit_log (
    id                BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_log PRIMARY KEY,
    at                DATETIME2(3)   NOT NULL CONSTRAINT DF_audit_log_at DEFAULT SYSUTCDATETIME(),
    editor            NVARCHAR(256)  NOT NULL,
    ip                NVARCHAR(64)   NOT NULL,
    user_agent        NVARCHAR(512)  NOT NULL CONSTRAINT DF_audit_log_ua DEFAULT N'',
    opportunity_id    NVARCHAR(40)   NOT NULL,                                            -- record: opportunity id, employee code or 'Catalogue'
    opportunity_name  NVARCHAR(200)  NOT NULL,                                            -- record name: opportunity or skill
    field             NVARCHAR(20)   NOT NULL CONSTRAINT CK_audit_log_field CHECK (field IN
                          (N'type', N'stage', N'estStartDate', N'months', N'value', N'confWinning', N'lead', N'created', N'skill', N'skill-created')),
    from_value        NVARCHAR(MAX)  NULL,                                                -- JSON value
    to_value          NVARCHAR(MAX)  NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_audit_log_at' AND object_id = OBJECT_ID(N'pursuits.audit_log'))
    CREATE INDEX IX_audit_log_at ON pursuits.audit_log (at DESC);
GO

-- version (bumped on every save, drives live refresh) and seeded_at.
IF OBJECT_ID(N'pursuits.meta', N'U') IS NULL
CREATE TABLE pursuits.meta (
    [key]  NVARCHAR(40)   NOT NULL CONSTRAINT PK_meta PRIMARY KEY,
    value  NVARCHAR(200)  NOT NULL
);
GO

IF OBJECT_ID(N'pursuits.data_sources', N'U') IS NULL
CREATE TABLE pursuits.data_sources (
    [file]       NVARCHAR(120)  NOT NULL CONSTRAINT PK_data_sources PRIMARY KEY,
    provenance   NVARCHAR(12)   NOT NULL,
    [rows]       INT            NOT NULL,
    description  NVARCHAR(400)  NOT NULL
);
GO

IF OBJECT_ID(N'pursuits.data_quality', N'U') IS NULL
CREATE TABLE pursuits.data_quality (
    id        NVARCHAR(60)    NOT NULL CONSTRAINT PK_data_quality PRIMARY KEY,
    [file]    NVARCHAR(120)   NOT NULL,
    severity  NVARCHAR(10)    NOT NULL CONSTRAINT CK_data_quality_severity CHECK (severity IN (N'high', N'watch')),
    title     NVARCHAR(300)   NOT NULL,
    detail    NVARCHAR(MAX)   NOT NULL,
    [rows]    INT             NOT NULL
);
GO

-- People with skills in Skills.csv but no allocation rows.
IF OBJECT_ID(N'pursuits.skill_only_employees', N'U') IS NULL
CREATE TABLE pursuits.skill_only_employees (
    code  NVARCHAR(20)  NOT NULL CONSTRAINT PK_skill_only_employees PRIMARY KEY
);
GO

/* ---------------------------------------------------------------------------------------------------------------------
   SEED: the shipped skill catalogue (35 skills, MECE) and the version row. Rows that already exist are kept.
   --------------------------------------------------------------------------------------------------------------------- */
INSERT INTO pursuits.dim_skill (skill, category, family, source)
SELECT v.skill, v.category, v.family, N'catalog'
FROM (VALUES
    (N'Demand planning',               N'Supply Chain', N'planning'),
    (N'Supply planning',               N'Supply Chain', N'planning'),
    (N'S&OP',                          N'Supply Chain', N'planning'),
    (N'Inventory management',          N'Supply Chain', N'planning'),
    (N'Logistics & transportation',    N'Supply Chain', N'logistics'),
    (N'Network design',                N'Supply Chain', N'logistics'),
    (N'Order management',              N'Supply Chain', N'logistics'),
    (N'Procurement & sourcing',        N'Supply Chain', N'procurement'),
    (N'Spend analytics',               N'Supply Chain', N'procurement'),
    (N'Manufacturing analytics',       N'Supply Chain', N'manufacturing'),
    (N'Quality analytics',             N'Supply Chain', N'manufacturing'),
    (N'Supply chain control tower',    N'Supply Chain', N'visibility'),
    (N'ESG & sustainability',          N'Supply Chain', N'esg'),
    (N'Python',                        N'Data Science', N'code'),
    (N'SQL',                           N'Data Science', N'code'),
    (N'Power BI',                      N'Data Science', N'bi'),
    (N'Tableau',                       N'Data Science', N'bi'),
    (N'Machine learning',              N'Data Science', N'ml'),
    (N'Optimization (OR)',             N'Data Science', N'ml'),
    (N'GenAI & agents',                N'Data Science', N'ml'),
    (N'Azure Data Factory',            N'FDE',          N'data-eng'),
    (N'Databricks',                    N'FDE',          N'data-eng'),
    (N'o9 Solutions',                  N'FDE',          N'platform'),
    (N'SAP S/4HANA',                   N'FDE',          N'platform'),
    (N'SAP IBP',                       N'FDE',          N'platform'),
    (N'Customer discovery',            N'FDE',          N'fde-client'),
    (N'Solution architecture',         N'FDE',          N'fde-client'),
    (N'Full-stack development',        N'FDE',          N'fde-build'),
    (N'Data engineering',              N'FDE',          N'fde-build'),
    (N'APIs & integrations',           N'FDE',          N'fde-build'),
    (N'LLM application development',   N'FDE',          N'fde-ai'),
    (N'Agent orchestration',           N'FDE',          N'fde-ai'),
    (N'Cloud deployment',              N'FDE',          N'fde-ops'),
    (N'MLOps / LLMOps',                N'FDE',          N'fde-ops'),
    (N'Rapid prototyping',             N'FDE',          N'fde-build')
) AS v (skill, category, family)
WHERE NOT EXISTS (SELECT 1 FROM pursuits.dim_skill d WHERE d.skill = v.skill);
GO

IF NOT EXISTS (SELECT 1 FROM pursuits.meta WHERE [key] = N'version')
    INSERT INTO pursuits.meta ([key], value) VALUES (N'version', N'1');
GO

/* ---------------------------------------------------------------------------------------------------------------------
   CHECK: should list 21 tables and 35 skills.
   --------------------------------------------------------------------------------------------------------------------- */
SELECT t.name AS table_name, SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.schema_id = SCHEMA_ID(N'pursuits')
GROUP BY t.name
ORDER BY t.name;

SELECT category, COUNT(*) AS skills FROM pursuits.dim_skill GROUP BY category ORDER BY category;
GO
