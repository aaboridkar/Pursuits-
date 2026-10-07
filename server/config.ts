// Loads the settings file: .env in the project folder, or the file named by PURSUITS_CONFIG. One KEY=value per
// line (see .env.example). A setting that is already in the environment — App Service application settings, a
// systemd EnvironmentFile, a shell variable — wins over the file, so the file only fills in what is missing.

import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

export function loadConfig(root = path.resolve(import.meta.dirname, '..')) {
  const file = process.env.PURSUITS_CONFIG ? path.resolve(process.env.PURSUITS_CONFIG) : path.join(root, '.env')
  if (!fs.existsSync(file)) {
    if (process.env.PURSUITS_CONFIG) throw new Error(`PURSUITS_CONFIG points to ${file}, which does not exist`)
    return null
  }
  const values = parseEnv(fs.readFileSync(file, 'utf8'))
  for (const [k, v] of Object.entries(values)) if (process.env[k] === undefined) process.env[k] = v
  return file
}
