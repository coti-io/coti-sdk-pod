# Features

## Contract-side features

| Capability | Where it comes from | Why it matters |
|---|---|---|
| Async cross-domain request/response | `/contracts/IInbox.sol` | Private operations complete through callbacks, not sync return values |
| Callback authorization | `/contracts/InboxUser.sol` (`onlyInbox`) | Prevents arbitrary callers from injecting fake callback data |
| Built-in common private methods | `/contracts/mpc/PodLib.sol` (`add64`, `gt64`, and related ops) | Fast path for common operations without custom COTI contract |
| Cross-chain fee and gas budgets | `/contracts/fee/InboxFeeManager.sol`, `/contracts/InboxMiner.sol` | Native `msg.value` split into remote vs callback gas-unit budgets via oracle-aware validation |
| Configurable target executor/chain | `/contracts/mpc/PodUser.sol` (`configure`, `configureCoti`) | Lets app point to desired COTI executor and chain ID (integrator must add access control) |
| Network routing presets | `/contracts/mpc/PodUserSepolia.sol` (and similar per-network mixins) | Constants for known deployments; use `contract X is PodLib, PodUserSepolia` plus `setInbox` / `configureCoti` in constructor |
| Typed argument encoding | `/contracts/mpccodec/MpcAbiCodec.sol` | Keeps argument schemas deterministic and ABI-aligned |
| Type declarations and conversions | `/contracts/utils/mpc/MpcCore.sol` | Defines `it*`, `ct*`, `gt*` and conversion operations |

## Client-side features

| Capability | Where it comes from | Why it matters |
|---|---|---|
| Encryption service integration | `/src/coti-pod-crypto.ts` `CotiPodCrypto.encrypt` | Simple UX path for building encrypted payloads |
| Local decryption helper | `/src/coti-pod-crypto.ts` `CotiPodCrypto.decrypt` | Converts contract ciphertext to plaintext using AES key |
| PoD method-call client | `/src/pod-method-call.ts` `PodContract` | Prices the inbox fee, encrypts `it*` args, attaches `msg.value`, and extracts `requestId`s from the receipt in a single call |
| Cross-chain request tracker | `/src/pod-request.ts` `PodRequest` | Reconstructs the source / target / response lifecycle so UIs can show `submitting → pending → executing → completed/failed` |
| Shared SDK config (JSON) | `/src/config.ts` `PodSdkConfig` | One JSON blob — chains, inbox addresses, RPCs, encryption network — shared by `PodContract` and `PodRequest` |
| Low-level typed crypto utilities | `@coti-io/coti-sdk-typescript` | Build signed typed input payloads and recover account key |

## Operationally important properties

- Privacy execution is asynchronous and request-ID-driven.
- Callback ABI decode must match COTI response encode exactly.
- Type boundaries (`it*`, `ct*`, `gt*`) are required for correctness.
- Key management on client side is part of production app security, not optional.
