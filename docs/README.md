# COTI PoD SDK Documentation

This documentation is for developers building production privacy dApps with `@coti/pod-sdk`.

Everything here is grounded in source files in this repository:

- `/contracts/IInbox.sol`
- `/contracts/InboxUser.sol`
- `/contracts/mpc/MpcUser.sol`
- `/contracts/mpc/PodLib.sol` (and `PodLib64` / `PodLib128` / `PodLib256`)
- `/contracts/mpc/PodUserSepolia.sol` (network routing constants; use with `PodLib`)
- `/contracts/fee/InboxFeeManager.sol`
- `/contracts/InboxMiner.sol`
- `/contracts/mpccodec/MpcAbiCodec.sol`
- `/contracts/utils/mpc/MpcCore.sol`
- `/src/coti-pod-crypto.ts`
- `/src/pod-method-call.ts`
- `/src/pod-request.ts`
- `/src/config.ts`

## Start here

1. `/docs/01-privacy-decentralized-apps-on-any-evm-chain-with-coti-pod.md`
2. `/docs/04-getting-started.md`
3. `/docs/05-writing-privacy-contracts-on-ethereum.md`
4. `/docs/06-typescript-integration-ux-development.md`
5. `/docs/06d-pod-sdk.md`

Then read deep dives:

- `/docs/05a-async-execution.md`
- `/docs/05b-multi-party-computing-library-mpclib.md`
- `/docs/05c-examples-with-description.md`
- `/docs/contracts/01-it-ct-gt-data-types.md`
- `/docs/contracts/02-contract-patterns-and-checklist.md`
- `/docs/contracts/03-request-builder-and-remote-calls.md`
- `/docs/contracts/04-fees-gas-and-oracle.md`

## Full document list

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
- `/docs/06d-pod-sdk.md`
- `/docs/contracts/01-it-ct-gt-data-types.md`
- `/docs/contracts/02-contract-patterns-and-checklist.md`
- `/docs/contracts/03-request-builder-and-remote-calls.md`
- `/docs/contracts/04-fees-gas-and-oracle.md`

## Scope notes

- This SDK gives contracts and TypeScript utilities. It does not provide deployment scripts, indexers, or backend services.
- PoD execution is asynchronous. Private operations do not return final plaintext synchronously in the same EVM call.
- “Any EVM chain” requires a deployed, connected Inbox route to COTI-side execution.

## Build docs with MkDocs

From `/docs`:

```bash
make install
make serve
```

Build static site:

```bash
make build
```

Output is generated at `/site`.

From repository root, you can also run:

```bash
npm run docs:install
npm run docs:serve
npm run docs:build
```
