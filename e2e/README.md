# End-to-end tests

These specs drive the real application in a browser against a real database.
Nothing is stubbed.

## What is covered

`document-to-action.spec.ts` - the golden path from the brief:

1. Register and provision an organization
2. Confirm a new tenant sees genuine empty states (no fabricated numbers)
3. Upload a document and watch it appear in the library
4. Wait for AI processing and reach the human review panel *
5. Edit a suggestion before approving it *
6. Approve it and confirm a real action exists *
7. Transition the action to completed *
8. Confirm the dashboard reflects the work
9. Sign out

Steps marked `*` are skipped with an explicit reason when `OPENAI_API_KEY` is
not set, because suggestions are never fabricated to keep a test green. The
other steps run against a real database and pass without a model key.

`authorization.spec.ts` - security:

- Unauthenticated visitors are redirected, and every protected API refuses an
  anonymous caller
- The second tenant cannot read, update, transition or delete the first tenant's
  action (all **404**, so the API never confirms another tenant's resource exists)
- A foreign organization's member list is never returned
- Malformed and hostile identifiers are rejected without leaking stack traces or
  driver internals
- Invalid status transitions are refused with `VALIDATION_ERROR`
- Adding a non-existent member never invents a user
- `/api/health` reports integration status without leaking credentials

## Prerequisites

A MongoDB instance and, for the AI stage, `OPENAI_API_KEY`. The document text in
the golden path is written so real extraction yields real suggestions.

```bash
# .env.local used by the dev server started below
MONGODB_URI=mongodb://127.0.0.1:27017/actiondoc
AUTH_SECRET=any-long-random-string
STORAGE_DRIVER=memory   # avoids needing S3 credentials for uploads
OPENAI_API_KEY=sk-...   # required for the review steps
```

Either start the app yourself and point the suite at it:

```bash
npm run dev
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Or let Playwright manage the dev server:

```bash
npm run test:e2e
```

## Notes

- Each run registers uniquely-named accounts, so runs do not collide and any
  leftovers are inert. Point the suite at a disposable database if you would
  rather not accumulate test tenants.
- Without `OPENAI_API_KEY` the golden path stops at the review step, because
  suggestions are never fabricated to keep a test green.
- Playwright will need its browser bundle once: `npx playwright install chromium`.
