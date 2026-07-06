---
name: pod-dapp-builder
description: Build new PoD (privacy-on-demand) applications and migrate existing non-private Solidity applications to COTI async privacy architecture. Use when working on contracts that must introduce `it*`, `ct*`, or `gt*` encrypted types; split logic between EVM and COTI sides; add Inbox one-way/two-way messaging; implement callback-based async flows; budget execution/callback fees; integrate `@coti-io/pod-sdk` (`CotiPodCrypto`, `PodContract`, `PodRequest`); or refactor synchronous contract behavior into request/response state machines.
---

# PoD dApp Builder

## Overview

Implement or refactor contracts into PoD architecture with correct encrypted types, async request handling, and fee budgeting. Prefer `PodLib` + COTI executor primitives when possible; use custom EVM + COTI contracts only when library coverage is insufficient.

**User-facing documentation** (canonical — do not duplicate in new docs; link instead):

- [Privacy on Demand index](https://github.com/coti-io/documentation/tree/main/privacy-on-demand)
- Local clone: `documentation/privacy-on-demand/` when both repos are in the workspace

**Do not** author PoD user docs under `coti-sdk-pod/docs/` — that folder only redirects to the documentation repo.

## Three-package stack

| Package | Repository | Use for |
| --- | --- | --- |
| `@coti-io/pod-sdk` | [coti-io/coti-sdk-pod](https://github.com/coti-io/coti-sdk-pod) | TypeScript only: `CotiPodCrypto`, `PodContract`, `PodRequest`, `PodSdkConfig` |
| `@coti-io/coti-contracts` | [coti-io/coti-contracts](https://github.com/coti-io/coti-contracts) | `PodLib`, `PodUser*`, `IInbox` interface, `MpcAbiCodec`, examples, tokens |
| `@coti-io/coti-pod-inbox-contracts` | [coti-io/coti-pod-inbox-contracts](https://github.com/coti-io/coti-pod-inbox-contracts) | Inbox **implementation**, `InboxFeeManager`, `InboxMiner`, `PriceOracle` |

Solidity imports always use `@coti-io/coti-contracts/contracts/pod/...` — never `@coti-io/pod-sdk/contracts/...` (the npm SDK ships TypeScript only).

## Documentation map (one canonical page per topic)

| Topic | Doc page |
| --- | --- |
| Architecture / three repos | [architecture-and-components.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/architecture-and-components.md) |
| Concept → source files | [for-developers-mapping-to-the-sdk.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/for-developers-mapping-to-the-sdk.md) |
| `it*` / `ct*` / `gt*` types | [reference-data-types.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/reference-data-types.md) |
| PodLib catalog & presets | [reference-podlib-and-primitives.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/reference-podlib-and-primitives.md) |
| Production checklist | [contract-patterns-checklist.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/contract-patterns-checklist.md) |
| Shipped examples | [reference-examples-and-contracts.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/reference-examples-and-contracts.md) |
| `@coti-io/pod-sdk` API | [typescript-pod-sdk.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/typescript-pod-sdk.md) |
| Account AES key onboarding | [account-onboarding-aes-key.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/account-onboarding-aes-key.md) |
| Low-level crypto (`recoverUserKey`, etc.) | [coti-typescript-sdk-for-pod.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/coti-typescript-sdk-for-pod.md) |
| Async UX | [async-private-operations.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/async-private-operations.md) |
| Fees (pedagogical) | [how-poa-fees-work.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/how-poa-fees-work.md) |
| Primitive walkthrough | [tutorial-private-adder-sepolia.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/tutorial-private-adder-sepolia.md) |
| Custom COTI logic | [tutorial-custom-logic.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/tutorial-custom-logic.md) |

## Quick start workflow

1. Classify each boundary as `it*`, `ct*`, `gt*`, or public — see `references/type-system-and-roles.md`.
2. Choose integration mode:
   - **Primitive:** `PodLib` + network preset (`PodUserSepolia`, `PodUserFuji`).
   - **Custom:** `MpcAbiCodec` + COTI-side contract — [tutorial-custom-logic](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/tutorial-custom-logic.md).
3. Wire EVM contract with preset (no manual inbox wiring):

```solidity
import "@coti-io/coti-contracts/contracts/pod/mpc/PodLib.sol";
import "@coti-io/coti-contracts/contracts/pod/mpc/PodUserSepolia.sol";

contract MyApp is PodLib, PodUserSepolia {
    constructor() PodLibBase(msg.sender) {}
    // PodUserSepolia constructor auto-wires inbox + configureCoti from PodNetworkConstants
}
```

4. Convert sync flows to async: submit via Inbox, persist `requestId`, fulfill in `onlyInbox` callback.
5. Budget fees (`msg.value`, `callbackFeeLocalWei`); estimate via Inbox views or `PodContract.estimateFee`.
6. Client: encrypt/decrypt with `CotiPodCrypto`; track lifecycle with `PodRequest`; extract `requestId` via `PodContract.extractRequestIds` (compact `MessageSent` events).

## Network constants (confirm against installed package)

From [`PodNetworkConstants.sol`](https://github.com/coti-io/coti-contracts/blob/main/contracts/pod/PodNetworkConstants.sol):

| Chain | Chain ID | Inbox (CREATE3, same on all) |
| --- | --- | --- |
| Ethereum Sepolia | 11155111 | `0xAb625bE229F603f6BBF964474AFf6d5487e364De` |
| COTI testnet | 7082400 | same |
| Avalanche Fuji | 43113 | same |

MPC executor (COTI testnet): `0xC76aaE4F3810fBBd5d96b92DEFeBE0034405Ad9c`

SDK defaults (`@coti-io/pod-sdk` ≥ 0.1.2) align with these values.

## Shipped examples (`@coti-io/coti-contracts`)

Use only examples that exist in `contracts/pod/examples/`:

- [`MpcAdder.sol`](https://github.com/coti-io/coti-contracts/blob/main/contracts/pod/examples/MpcAdder.sol) — minimal `add64` flow
- [`PodAdder128.sol`](https://github.com/coti-io/coti-contracts/blob/main/contracts/pod/examples/it128/PodAdder128.sol)
- [`PodAdder256.sol`](https://github.com/coti-io/coti-contracts/blob/main/contracts/pod/examples/it256/PodAdder256.sol)
- [`MpcAdderPausable.sol`](https://github.com/coti-io/coti-contracts/blob/main/contracts/pod/examples/MpcAdderPausable.sol) — **fault testing** (callback reverts while paused; COTI leg can still succeed)

Do **not** reference removed/stale examples (`Millionaire.sol`, `PErc20.sol`, `PodTest*.sol`) unless reintroduced in the repo. For custom token patterns see `contracts/pod/token/` and the [investor cookbook](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/cookbook-private-investor-allocations.md).

## TypeScript client (`@coti-io/pod-sdk`)

```bash
npm install @coti-io/pod-sdk ethers
```

| Class | Role |
| --- | --- |
| `CotiPodCrypto` | Encrypt `it*` via PoD encryption service; decrypt `ct*` with account AES key |
| `PodContract` | Fee estimate, `encryptAndCallMethod` / `callMethod`, `extractRequestIds` |
| `PodRequest` | `trackRequest(chainId, requestId)` for cross-chain async UX |
| `PodSdkConfig` | Shared JSON config (chains, inbox addresses, RPCs, encryption network) |

Account key recovery is in `@coti-io/coti-sdk-typescript` — not `@coti-io/pod-sdk`.

## Delivery checklist

See [contract-patterns-checklist.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/contract-patterns-checklist.md). Skill-local detail:

- `references/type-system-and-roles.md` — type mapping and `ctUint128` / `ctUint256` shapes
- `references/fees-and-pricing.md` — fee model and estimation
- `references/conversion-playbook.md` — migration from sync non-private contracts

## References (skill-local)

- `references/type-system-and-roles.md`
- `references/conversion-playbook.md`
- `references/fees-and-pricing.md`
