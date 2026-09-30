<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI copy rules

- Page and section titles must stand on their own. Do not add explanatory subtitles, eyebrow labels, or descriptive badges directly above or below a title.
- Put necessary guidance only where users act on it, such as field help, validation, empty states, or error messages.

## Deployment workflow

When the user asks to deploy or apply changes, use the Git-backed production workflow unless they explicitly request a preview or a local-only deployment.

1. Review the deployment-scope changes and run the relevant tests, migration checks, and production build.
2. Apply and verify any pending Supabase migrations before releasing application code that depends on them.
3. Commit all user-approved, deployment-scope changes and push the current `main` branch to `origin/main`. Never overwrite or discard unrelated user changes.
4. Use the Vercel Git integration as the primary production deployment path. Do not create a separate CLI production deployment when the Git-triggered deployment is working.
5. Wait for the pushed commit's Vercel deployment to reach a terminal state, confirm the production alias points to it, verify an HTTP response, and inspect recent error logs.
6. Report the Git commit, migration result, production URL, deployment status, and any remaining test or monitoring warnings.
