# GuliMon

A static site (GitHub Pages, no backend, no server) where visitors upload a
picture of their "Gilguli" and it becomes an entry in the public **GuliDex**.

- Browse the GuliDex: `index.html`
- Submit a Gilguli: `submit.html`
- How submission and moderation actually work: [CONTRIBUTING.md](CONTRIBUTING.md)

## How it works, in short

There's no login on this site and no API tokens anywhere in the client.
Submitting means: fork this repo → upload your image → commit a pre-filled
JSON file → open a pull request, all under your own GitHub account, all
on github.com itself. Until your PR merges, your submission lives only in
your browser's `localStorage`.

Moderation is fully automated: a GitHub Action validates schema/size/shape
and, if it passes, another Action auto-merges the PR with no human review of
the image content. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full flow
and the tradeoffs behind that design.

## Repo layout

```
/index.html                  GuliDex — browse public + local-pending Gilgulis
/submit.html                 Submission wizard
/css/style.css
/js/dex.js                   Fetch data/dex.json, merge with localStorage pending, render grid
/js/submit.js                Form handling, image resize, id generation, deep-link building
/js/github-links.js          Pure functions that build GitHub deep links (unit-tested)
/js/schema.js                Submission schema + validator, shared by submit.js and the CI scripts
/data/dex.json                Generated — do not hand-edit. Rebuilt by build-dex.yml on push to main.
/submissions/                One <id>.json + <id>.png pair per submission, added via PR
/.github/workflows/          validate-submission.yml, automerge-submission.yml, build-dex.yml
/.github/scripts/            Node scripts the above workflows run
/tests/                      Unit tests for js/github-links.js (node --test)
```

## Local development

No build step — open `index.html` / `submit.html` directly, or serve the
directory with any static file server (needed for `fetch()` of
`data/dex.json` to work, since `file://` fetches are blocked in most
browsers):

```sh
npx serve .
```

## Tests

```sh
npm install
npm test
```

## Deployment

Enable GitHub Pages for this repo (Settings → Pages → deploy from `main`).
No build step is required — Pages serves the static files as-is, and
`build-dex.yml` keeps `data/dex.json` up to date.
