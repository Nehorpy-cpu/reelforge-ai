# Security policy

Do not commit API keys, Bancard credentials, customer exports, generated media, SQLite databases or local environment files.

Report suspected vulnerabilities privately to the repository owner. Include the affected route, prerequisites, impact and a minimal reproduction. Do not test against customer data or production provider accounts.

Before release, run:

```bash
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```
