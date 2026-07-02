# @coti/pod-sdk

TypeScript SDK for building privacy dApps on EVM with COTI Privacy on Demand (PoD): encryption/decryption helpers, fee-aware contract calls, and cross-chain request tracking.

## Install

From npm:

```bash
npm install @coti/pod-sdk ethers
```

`ethers` v6 is a **peer dependency** — install it in your app alongside this package.

From GitHub:

```bash
npm install github:coti-io/coti-sdk-pod
```

## Documentation

**User-facing documentation** lives in the [COTI documentation](https://github.com/coti-io/documentation) repo:

- [Privacy on Demand](https://github.com/coti-io/documentation/tree/main/privacy-on-demand) — concepts, tutorials, API reference
- [TypeScript PoD SDK](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/typescript-pod-sdk.md) — `CotiPodCrypto`, `PodContract`, `PodRequest`

**Solidity contracts** (not shipped in this package):

- [`@coti-io/coti-contracts`](https://github.com/coti-io/coti-contracts/tree/main/contracts/pod) — `PodLib`, `PodUser`, interfaces, examples
- [`@coti-io/coti-pod-inbox-contracts`](https://github.com/coti-io/coti-pod-inbox-contracts) — Inbox implementation, fee manager, miner

## Public API

```typescript
import {
  CotiPodCrypto,
  DataType,
  PodContract,
  PodRequest,
  SEPOLIA_DEFAULT_INBOX_ADDRESS,
  COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  type PodSdkConfig,
} from "@coti/pod-sdk";
```

## Package and release

```bash
npm run ci:verify
```

**Full-stack e2e** (live Sepolia + COTI testnet, requires `.env`): see [`examples/private-adder-e2e`](examples/private-adder-e2e/README.md).

Publish flow:

1. Bump version: `npm version patch|minor|major`
2. Push commit and tag to `main`
3. The `Publish npm package` GitHub Action publishes matching `v*.*.*` tags

## Current version

`0.1.2`
