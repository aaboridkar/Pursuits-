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

## Database: Azure SQL

The app uses Azure SQL when `AZURE_SQL_SERVER` is set, otherwise a local SQLite file. All settings go in a **settings file**: copy `.env.example` to `.env` in the project folder and fill it in (`.env` is never committed). On the VM the setup script keeps them in `/etc/pursuits/pursuits.env`; on App Service they are application settings. A value already in the environment wins over the file.

1. **Create the tables** (once): run `deploy/azure-sql/01-create-tables.sql` in SSMS against the database. It creates schema `AIT_SC_Gov` with all tables and the skill catalogue.
2. **Give the app a database login**, either
   - *SQL login* (`AZURE_SQL_AUTH=sql`): a contained user, e.g. `CREATE USER pursuits_app WITH PASSWORD = '…'; ALTER ROLE db_datareader ADD MEMBER pursuits_app; ALTER ROLE db_datawriter ADD MEMBER pursuits_app;` — put the name and password in the settings file; or
   - *Microsoft Entra* (`AZURE_SQL_AUTH=entra`, no password): turn on the VM's / App Service's managed identity, then `CREATE USER [<vm or app name>] FROM EXTERNAL PROVIDER;` and the same two roles.
3. **Network**: the machine running the app must reach the server on port 1433 (the Azure SQL firewall / private endpoint must allow it).
4. **Check**: `npm run db:check` connects, confirms the tables and lists their rows. Its messages say what to fix (firewall, login, network).
5. **Data** — choose one, before the first start:
   - `npm run db:copy-to-azure data/pursuits.db` copies an existing SQLite database (data, edits, clients, skills, change log) into the empty tables; or
   - just start the app: on empty tables it fills them from the project's CSVs.
6. **Start**: `npm start`. The first log line names the database in use, e.g. `… · Azure SQL <server>/<database> [AIT_SC_Gov]`.
## Deployment: Azure App Service in front, SQLite on a VM

```
 Browser ──https──▶ Azure App Service (gateway)  ──VNet──▶  VM 10.17.131.7:4100
                    screens + forwards /api                   Pursuits server + SQLite file
                    API_UPSTREAM, GATEWAY_KEY                 PURSUITS_DB, GATEWAY_KEY, TRUST_PROXY
```

The same code runs in both places; `npm start` picks the role. With `API_UPSTREAM` set it is the **gateway**: it serves the screens and forwards every `/api` request (including the live-update stream) to the VM, and opens no database. Without it, it is the **server**: API + SQLite database. The VM answers only requests carrying the shared `GATEWAY_KEY`, so nobody can reach the data, or forge the name the change log records, by calling the VM directly.

### 1. The VM (Ubuntu) — server and database

Copy the project zip to the VM and run the setup script. It installs Node.js 24 and SQLite tools, creates a `pursuits` service account, installs/builds/tests the app, creates the database (from the CSVs, or `IMPORT_DB=` an existing `pursuits.db`), generates the gateway key, runs it as a systemd service with nightly backups, and prints the two values for App Service. Re-running it with a newer zip updates the app and keeps the database and key.

```bash
unzip -p pursuits.zip deploy/setup-vm.sh > setup-vm.sh && chmod +x setup-vm.sh
sudo ALLOW_FROM=<app-service-integration-subnet, e.g. 10.17.140.0/24> ./setup-vm.sh pursuits.zip
```

| Setting | Default | |
|---|---|---|
| `ALLOW_FROM` | — | Only this subnet may reach the port (ufw); otherwise set the same rule in the NSG |
| `IMPORT_DB` / `FORCE_IMPORT=1` | — | Start from an existing database (the current one is backed up before replacing) |
| `PORT` | 4100 | |
| `DATA_DIR` | `/var/lib/pursuits` | The database; updates never touch it |

Server settings live in `/etc/pursuits/pursuits.env`; `sudo journalctl -u pursuits -f` shows the log.
### 2. Azure App Service — the gateway

1. **Create** a Web App: Code, **Node 24 LTS**, **Linux**, Basic B1 (or higher).
2. **Networking → VNet integration**: add the VNet/subnet that can reach 10.17.131.7.
3. **Environment variables → App settings**:

   | Setting | Value |
   |---|---|
   | `API_UPSTREAM` | `http://10.17.131.7:4100` |
   | `GATEWAY_KEY` | the same key as on the VM |
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |

4. **Configuration → General settings**: Startup command `npm start`, **Always on** = On.
5. **Deploy the code**: zip the project folder without `node_modules`, `dist` and `.git` (`package.json` at the top of the zip) and drag it onto `https://<app>.scm.azurewebsites.net/ZipDeployUI` — or Deployment Center → GitHub.
6. **Authentication → Add identity provider → Microsoft**, *Require authentication*. The change log then records each person's name.

Open `https://<app>.azurewebsites.net/opportunities`: green dot in the top bar = the gateway reaches the VM and its database. A red dot reading "Database unavailable" means the gateway can't reach the VM (VNet integration, NSG, or the service is down) — `journalctl -u pursuits -f` on the VM and **Log stream** on the App Service show why.

### Updating

Same zip on both: on the VM unzip over `/opt/pursuits`, `npm install && npm run build && sudo systemctl restart pursuits`; on App Service drag the zip onto ZipDeployUI again. The database in `/var/lib/pursuits` is never touched by an update.