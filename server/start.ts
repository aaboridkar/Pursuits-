// `npm start` entry point. Loads the settings file (.env), then picks a role:
//   • API_UPSTREAM set → gateway: serve the screens and forward data requests to the server that owns the
//     database (e.g. App Service in front of a VM);
//   • otherwise → the server: API, database (Azure SQL or SQLite, per the settings) and screens in one.

import { loadConfig } from './config'

const file = loadConfig()
if (file) console.log(`Settings from ${file}`)

if (process.env.API_UPSTREAM) await import('./gateway')
else await import('./index')
