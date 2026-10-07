// npm run db:copy-to-azure [path/to/pursuits.db]
// Copies everything from a Pursuits SQLite database — the imported data, every edit made in the app, the
// dimension tables and the change log — into the empty Azure SQL tables named in .env. One transaction: it
// either all arrives or nothing does. Refuses if the Azure tables already hold data.

import path from 'node:path'
import { loadConfig } from '../server/config'
import { openDb, readAudit, readDataset, readRuntime } from '../server/db'
import { AzureSqlBackend, azureSqlConfigFromEnv } from '../server/db-mssql'

loadConfig()
const source = path.resolve(process.argv[2] ?? process.env.PURSUITS_DB ?? 'data/pursuits.db')
const cfg = azureSqlConfigFromEnv()
if (!cfg) {
  console.error('AZURE_SQL_SERVER is not set. Copy .env.example to .env and fill in the Azure SQL settings.')
  process.exit(1)
}

const lite = openDb(source, { importLegacy: false })
const data = readDataset(lite)
const runtime = readRuntime(lite)
const audit = readAudit(lite, 1_000_000)
console.log(`From ${source}: ${data.opportunities.length + runtime.opportunitiesAdded.length} opportunities, ${data.employees.length} employees, ${runtime.clients.length} clients, ${runtime.skillCatalog.length} skills, ${Object.keys(runtime.opportunityEdits).length} edited opportunities, ${audit.length} log entries`)

const azure = await AzureSqlBackend.openBare(cfg)
try {
  if (!(await azure.isEmpty())) {
    console.error(`✗ [${cfg.schema}] already holds data; nothing was copied. Copy only into freshly created tables.`)
    process.exit(1)
  }
  console.log(`Copying into ${azure.name} …`)
  await azure.seed(data, runtime, audit)
  const counts = await azure.counts()
  console.log('✓ Done:')
  for (const [t, n] of Object.entries(counts).sort()) console.log(`    ${t.padEnd(24)} ${String(n).padStart(6)} rows`)
} finally {
  await azure.close()
}
