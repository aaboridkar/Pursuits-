// npm run db:check — tests the Azure SQL settings in .env: connects, checks the schema's tables exist, and lists
// how many rows each holds. Changes nothing.

import { loadConfig } from '../server/config'
import { AzureSqlBackend, azureSqlConfigFromEnv } from '../server/db-mssql'

const file = loadConfig()
console.log(file ? `Settings from ${file}` : 'No .env file — using environment variables only')

const cfg = azureSqlConfigFromEnv()
if (!cfg) {
  console.error('AZURE_SQL_SERVER is not set. Copy .env.example to .env and fill in the Azure SQL settings.')
  process.exit(1)
}
console.log(`Connecting to ${cfg.server} / ${cfg.database} as ${cfg.auth === 'sql' ? `SQL login "${cfg.user}"` : 'Microsoft Entra (managed identity / az login)'} …`)

try {
  const db = await AzureSqlBackend.openBare(cfg)
  console.log(`✓ Connected; schema [${cfg.schema}] has all ${AzureSqlBackend.TABLES.length} tables`)
  const counts = await db.counts()
  for (const [t, n] of Object.entries(counts).sort()) console.log(`    ${t.padEnd(24)} ${String(n).padStart(6)} rows`)
  console.log(counts.opportunities ? '✓ Holds data — the app will use it.' : '• Tables are empty — the app fills them from the CSVs on first start, or run: npm run db:copy-to-azure')
  await db.close()
} catch (e) {
  const msg = (e as Error).message
  console.error(`✗ ${msg}`)
  if (/Client with IP address/i.test(msg)) console.error("  → The Azure SQL server's firewall blocks this machine's address. Ask the DBA to allow it, or run from the VM.")
  else if (/Login failed/i.test(msg)) console.error('  → Wrong user name or password, or the login has no user in this database.')
  else if (/ENOTFOUND|getaddrinfo/i.test(msg)) console.error('  → The server name does not resolve from here — check AZURE_SQL_SERVER, or run from a machine on the company network/VM.')
  else if (/ETIMEOUT|ESOCKET|timeout/i.test(msg)) console.error('  → No answer on port 1433: a firewall/network rule is blocking it. Run from the VM, or ask for access.')
  else if (/CredentialUnavailable|ManagedIdentity|token/i.test(msg)) console.error('  → Entra sign-in failed: run `az login` first, or give the App Service/VM a managed identity — or use AZURE_SQL_AUTH=sql.')
  process.exit(1)
}
