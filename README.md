# GuliMon

A site where visitors upload a picture of their "Gilguli" and it becomes an
entry in the public **GuliDex** — one click, no account required.

- Browse the GuliDex: `index.html`
- Submit a Gilguli: `submit.html`
- How submission and moderation actually work: [CONTRIBUTING.md](CONTRIBUTING.md)

## How it works, in short

The site is almost entirely static. The one exception is
`functions/api/submit.js`, a Cloudflare Pages Function that holds the
project's only secret (a GitHub token) and does the GitHub work a visitor
used to have to do by hand: it creates a branch, commits the image + JSON,
and opens a pull request. Everything downstream — validation and
auto-merge — is unchanged, unattended, GitHub Actions.

Until a submission's PR merges, it only exists in the submitting browser's
`localStorage`, shown as "pending" on the GuliDex.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full flow and the tradeoffs
behind fully automated, human-free moderation (and the currently-accepted
lack of a login/CAPTCHA gate on submission).

## Repo layout

```
/index.html                  GuliDex — browse public + local-pending Gilgulis
/submit.html                 Submission form
/css/style.css
/js/dex.js                   Fetch data/dex.json, merge with localStorage pending, render grid
/js/submit.js                Form handling, image resize, POST to /api/submit
/js/id.js                    Submission id generation (slugify + random suffix), used server-side
/js/schema.js                Submission schema + validator, shared by the function and the CI scripts
/functions/api/submit.js     Cloudflare Pages Function — the only server-side code, holds GITHUB_TOKEN
/data/dex.json                Generated — do not hand-edit. Rebuilt by build-dex.yml on push to main.
/submissions/                One <id>.json + <id>.png pair per submission
/.github/workflows/          validate-submission.yml, automerge-submission.yml, build-dex.yml
/.github/scripts/            Node scripts the above workflows run
/tests/                      Unit tests (node --test)
```

## Local development

```sh
npm install
npx wrangler pages dev .
```

`wrangler pages dev` serves the static files and runs `functions/api/submit.js`
locally, matching production. You'll need a `.dev.vars` file (gitignored)
with `GITHUB_TOKEN=...` for the function to actually reach GitHub — see
Deployment below for how to create that token.

Opening `index.html`/`submit.html` directly via a plain static server (e.g.
`npx serve .`) works for browsing the GuliDex, but `/api/submit` won't exist
without `wrangler pages dev` or a real deployment.

## Tests

```sh
npm test
```

## Deployment

1. **Create a GitHub token for the function.** In your GitHub account:
   Settings → Developer settings → Fine-grained tokens → Generate new token,
   scoped to **only this repository**, with repository permissions
   `Contents: Read and write` and `Pull requests: Read and write`. No other
   scopes needed.
2. **Create a Cloudflare Pages project** connected to this repo (or deploy
   via `npx wrangler pages deploy .`). Build command: none. Output
   directory: `/` (repo root) — there's no build step.
3. **Set the secret**: in the Pages project's Settings → Environment
   variables, add `GITHUB_TOKEN` (as a secret, not plaintext) with the token
   from step 1. Cloudflare Pages auto-detects `functions/api/submit.js` and
   serves it at `/api/submit` alongside the static site — no extra config.
4. Confirm `OWNER`/`REPO`/`BASE_BRANCH` at the top of
   `functions/api/submit.js` match this repo (they're hardcoded, same as the
   rest of the project).
5. In this repo's Settings → Actions → General → Workflow permissions,
   enable "Allow GitHub Actions to create and approve pull requests" — this
   is what lets `automerge-submission.yml` merge PRs and delete their
   branches with the default `GITHUB_TOKEN`.

No GitHub Pages setup is needed — Cloudflare Pages now serves the site.
