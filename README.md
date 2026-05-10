# @coti/pod-sdk

SDK for building privacy dApps on EVM with COTI Privacy on Demand (PoD): async Inbox messaging patterns and TypeScript crypto helpers.

## Install

From npm (when published):

```bash
npm install @coti/pod-sdk
```

From GitHub:

```bash
npm install github:cotitech-io/coti-pod-sdk
```

GitHub installs build from source via the `prepare` script. npm installs use the
prebuilt `dist` output published in the package tarball.

## Package and release

Validate the npm package locally:

```bash
npm run ci:verify
npm run publish:dry-run
```

Publish flow:

1. Bump the version with one of:

   ```bash
   npm version patch # 0.1.0 -> 0.1.1 for fixes/small changes
   npm version minor # 0.1.0 -> 0.2.0 for backwards-compatible features
   npm version major # 0.1.0 -> 1.0.0 for breaking changes
   ```

   This updates `package.json` and `package-lock.json`, creates a git commit,
   and creates a matching tag such as `v0.1.1`.
2. Merge the version commit to `main`, then push the generated tag, for example
   `git push && git push --tags`.
3. The `Publish npm package` GitHub Action publishes the matching `v*.*.*` tag
   to npm only if the tagged commit is on `main`.

To test the publish workflow without publishing, run `Publish npm package` manually
from GitHub Actions and keep `dry_run` enabled.

The repository must have an `NPM_TOKEN` secret with permission to publish
`@coti/pod-sdk`.

## Documentation

Production documentation lives in `/docs`:

- `/docs/README.md` (documentation index)
- `/docs/01-privacy-decentralized-apps-on-any-evm-chain-with-coti-pod.md`
- `/docs/02-showcase.md`
- `/docs/03-features.md`
- `/docs/04-getting-started.md`
- `/docs/05-writing-privacy-contracts-on-ethereum.md`
- `/docs/05a-async-execution.md`
- `/docs/05b-multi-party-computing-library-mpclib.md`
- `/docs/05c-examples-with-description.md`
- `/docs/06-typescript-integration-ux-development.md`
- `/docs/06a-coti-typescript-sdk.md`
- `/docs/06b-encrypt-decrypt.md`
- `/docs/06c-onboarding-account-account-aes-key.md`
- `/docs/contracts/01-it-ct-gt-data-types.md`
- `/docs/contracts/02-contract-patterns-and-checklist.md`
- `/docs/contracts/03-request-builder-and-remote-calls.md`

MkDocs setup lives in `/docs`:

- Config: `/docs/mkdocs.yml`
- GitBook navigation: `/docs/SUMMARY.md`
- Dependencies: `/docs/requirements.txt`
- Commands: `/docs/Makefile` (`make install`, `make serve`, `make build`)

From repo root:

- `npm run docs:install`
- `npm run docs:serve`
- `npm run docs:build`

Docs CI/CD:

- Pull requests and pushes to `main` build the docs with MkDocs.
- Pushes to `main` that change `/docs` run `Publish docs to GitBook`.
- Manual `Publish docs to GitBook` runs default to `dry_run`, which builds docs
  without pushing. Non-dry-run docs publishing must run from `main`.
- To publish to GitBook, configure GitBook Git Sync to a repository/branch, then
  set `GITBOOK_SYNC_REPOSITORY` (for example `cotitech-io/coti-pod-sdk-gitbook`),
  optional `GITBOOK_SYNC_BRANCH` (defaults to `main`), and a `GITBOOK_SYNC_TOKEN`
  secret with write access to that repository.

## Current version

`0.1.0`
