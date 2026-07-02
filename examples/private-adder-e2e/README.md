# Private Adder E2E Example

Full-stack integration test for `@coti/pod-sdk`: deploy a `PrivateAdder` on Sepolia, submit a private `add(10, 20)` request, track it across Sepolia and COTI testnet with `PodRequest`, read the encrypted sum, and decrypt locally.

This folder is **not published** — all Hardhat and contract dependencies are dev-only here.

`@coti-io/coti-contracts` is installed from [GitHub `main`](https://github.com/coti-io/coti-contracts) because PoD contracts (`PodLib`, `PodUserSepolia`) are not yet in the latest npm release.

## Prerequisites

- Node.js 18+
- Sepolia ETH on the test account (deploy + `add` tx fees)
- Account AES key for the same wallet ([onboarding guide](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/account-onboarding-aes-key.md))

## Setup

```bash
cd examples/private-adder-e2e
cp .env.example .env
# Edit .env with your RPC URLs, private key, and AES key
npm install
```

Build the parent SDK (done automatically by `npm test`):

```bash
npm run build:sdk
```

## Contract address (hybrid deploy)

The test resolves the contract in this order:

1. `PRIVATE_ADDER_SEPOLIA_ADDRESS` in `.env`
2. `deployed.json` (written by deploy script)
3. Auto-deploy when `DEPLOY_ON_MISSING=true` (default)

Deploy manually:

```bash
npm run compile
npm run deploy
```

## Run the e2e test

```bash
npm test
```

The test skips automatically when required env vars are missing.

## What it exercises

| SDK API | Step |
|---------|------|
| `PodContract.encryptAndCallMethod` | Submit `add` with encrypted inputs |
| `PodContract.extractRequestIds` | Read `requestId` from Inbox `MessageSent` |
| `PodRequest.trackRequest` | Poll cross-chain state (Sepolia → COTI → callback) |
| `CotiPodCrypto.decrypt` | Decrypt `ctUint256` sum → `"30"` |

## Environment variables

See [`.env.example`](.env.example) for the full list.
