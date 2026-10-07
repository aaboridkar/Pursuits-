// `npm start` entry point. With API_UPSTREAM set this machine only serves the screens and forwards data
// requests to the server that owns the database (forwarding mode, e.g. App Service in front of a VM);
// otherwise it is that server: API, database and screens in one.

if (process.env.API_UPSTREAM) await import('./gateway')
else await import('./index')

export {}
