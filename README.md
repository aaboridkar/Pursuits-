# Workforce Nexus — Capacity, Demand & Deployment

Answers seven questions for leadership and resource managers in the Supply Chain practice: what capacity there is today, what frees up later, what the pipeline needs, where the gaps are, who might stay on the bench, who fits each opportunity, and each person's full deployment history.

## Run it

```bash
npm install
npm run dev        # API on :4100 + UI on http://localhost:5173
npm test           # engine tests against facts traced from the CSVs
npm run build && npm start   # production: API serves the built UI on :4100
npm run generate   # regenerate data/synthetic/ (deterministic)
```

> The folder name contains `&`, which breaks npm's Windows `.bin` shims, so the scripts call each tool's JS entry point through `node` directly.

## Modules and how they connect

| Route | Module |
|---|---|
| `/` | **Leadership overview** — the 10 headline KPIs (every tile drills down), supply vs demand by month, capacity by grade, action-required alerts |
| `/opportunities`, `/opportunities/:id` | **Opportunity pipeline** and **resource requirements** (add / edit / delete roles; coverage per role) |
| `/capacity` | **Capacity & availability** — Now / Next month / Next 3 months / Next 6 months |
| `/risk` | **People at risk** of staying on the bench, with their probable next deployment |
| `/workbench` | **Deployment workbench** — ranked candidates per requirement; propose, confirm, release |
| `/skills` | **Skills matrix** — heatmap, editable skill list, coverage vs demand, outdated profiles |
| `/employees`, `/employees/:code` | **Employee 360** — assignment, skills, deployment and bench timeline, monthly allocation, project history, opportunity matches, decisions |
| `/data` | Data sources, provenance, data-quality findings and calculation rules |

Workflow: Opportunity → Requirement → Capacity gap → Candidates → Employee, and back again (Employee → Capacity → Skills → Project history → Opportunity matches). A journey strip on each workflow screen links the stages for the record you're looking at. **Confirming** a candidate books them as a planned billable allocation, so capacity, bench age, risk, gaps and alerts all recalculate. A **proposal** books no capacity.

## Architecture

- `shared/`: types, date helpers and the catalog (grades, skills, stage defaults), used by both the API and the UI.
- `server/data/load.ts`: reads and normalizes the CSVs (Excel serial dates, `$-` values, free-text skills) and records data-quality findings.
- `server/engine/`: `capacity.ts` turns allocations into per-day arrays. `matching.ts` holds the candidate scoring. `model.ts` handles demand, coverage, risk, alerts and the views. Results are cached per data scope and state version.
- `server/db.ts` and `server/store.ts`: everything lives in a SQLite database, `data/pursuits.db` (Node's built-in `node:sqlite`; set `PURSUITS_DB` to use another path). On first start the CSVs are imported into it, along with any edits from the older `data/runtime/state.json`. After that the app reads and writes only the database: the data, decisions and edits made in the app, and the change log (`audit_log`: who saved, their address and browser, and each field from → to). The CSVs are never written to. To start again from the CSVs, stop the app and delete `data/pursuits.db*`.
- Live updates: open browsers keep a connection to `/api/events` and refetch whenever anyone saves. The server also checks the database file every 2 seconds, so a write from another server or a database tool reaches every screen too.
- `src/`: React + Tailwind v4 on the existing Fractal component library (`src/components/ui`, `layout`, `domain/KpiTile`). New workforce pieces live in `src/components/workforce/`. Charts are plain SVG on the design tokens; no chart library was added.

### Design system notes
The repository's components referenced a token stylesheet that wasn't included. `src/index.css` rebuilds it from how the components use it: Open Sans (vendored), Fractal blue for actions and yellow for the accent, the logo's slate greys, and status colours used only for status. The chart palette (c1–c5) was checked with a colour-vision-deficiency (CVD) validator. `LeftRail`, `TopBar` and `JourneyStrip` were adapted from IBP to workforce content without changing their markup or styling. IBP-only domain components remain in the repo for reference but are excluded from the build (see `tsconfig.app.json`).

## Data

**Snapshot date: 6 Oct 2026.** The allocation report's last "Current allocation" row is 6 Oct → 6 Oct.

| Source (read-only) | Notes |
|---|---|
| `allocation_report.csv` | 100 rows, 11 employees. Two rows have no Employee Code and are excluded. |
| `Opportunity.csv` | 6 opportunities: 2 won, 1 lost, 3 open. Start date, duration and win confidence are mostly blank. The monthly columns are **confidence-weighted** (Pepsico: 63,000 + 40,500 = 90% of 115,000), and the Q/H/FY roll-ups are inconsistent, so quarters are recomputed from the months. |
| `Skills.csv` | One employee (F09560), who doesn't appear in the allocation report. Most entries give no proficiency level. |

The synthetic data is generated by `scripts/generate-synthetic.ts`, is deterministic, and is written to `data/synthetic/`. Every synthetic record is tagged in the UI (`SYN` on records; `est.`/`drv` on assumed or derived fields).
- **29 additional employees** (codes `FX2xxxx`) on real projects, so bench ageing, risk and matching have a realistic population. The **Source records only** switch in the top bar hides them and the synthetic opportunities, and recalculates every figure.
- **Skills** for the 11 real employees, inferred from their project history (the basis is shown for each skill).
- **Assumed tracker fields**, one row per field with its reasoning. Values are derived from monthly revenue wherever possible before anything is assumed.
- **8 additional opportunities** at accounts already in the allocation report.
- **Resource requirements** (role, grade, FTE, supply chain skill, technical skill, dates) for every live opportunity.

### Key rules
- Allocated = billable + internal delivery work (Capability, Core Delivery).
- Bench pools and "Blocked for <client>" count as free capacity; parental leave counts as unavailable.
- Bench age = continuous days at 0% allocation, not on leave, counted back from the snapshot.
- Expected demand = unfilled FTE × win probability (won = 1, lost = 0).
- Match score = 40% skill + 20% grade + 25% availability (first 90 days, judged per seat) + 15% bench priority, +5 for prior work at the account.

## Deploy to Azure App Service

1. **Create the Web App** (Azure Portal → App Services → Create): Publish **Code**, Runtime **Node 24 LTS**, OS **Linux**. A single instance — the SQLite database is one file, so do not scale out.
2. **Configuration → Application settings**:

   | Setting | Value | Why |
   |---|---|---|
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Azure runs `npm install` and `npm run build` on each deploy |
   | `PURSUITS_DB` | `/home/data/pursuits.db` | Keeps the database outside the deployed code, so deploys never replace it |
   | `PURSUITS_DB_JOURNAL` | `DELETE` | `/home` is a network share; SQLite's WAL mode needs a local disk |
   | `TRUST_PROXY` | `1` | Logs each visitor's real IP from Azure's front end instead of Azure's own |

   **General settings**: Startup command `npm start`; **Always On** = On (keeps live updates and the database warm).
3. **Deployment Center**: Source **GitHub**, pick this repository and branch `main`. Every push redeploys.
4. **Sign-in (recommended — the app has no login of its own)**: **Authentication → Add identity provider → Microsoft**, "Require authentication". The change log then records each person's name instead of their IP.

The first start creates the database from the CSVs in the repository. To bring existing data across, stop the app and upload your `data/pursuits.db` to `/home/data/` (Kudu / Advanced Tools → Debug console).
