# Type System And Roles

Canonical doc: [reference-data-types.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/reference-data-types.md) (`MpcCore.sol` in `@coti-io/coti-contracts`).

## Purpose

Map data across client, EVM, and COTI boundaries without leaking sensitive information or breaking ABI compatibility.

## Canonical type meanings

- **`it*`** — encrypted + signed user input; EVM entrypoints and `MpcAbiCodec` payloads.
- **`ct*`** — encrypted output decryptable client-side with account AES key; EVM storage and callbacks.
- **`gt*`** — COTI-only private compute values; never in EVM public interfaces.
- **Public types** — non-private metadata only (`address`, `bytes32`, enums, etc.).

## Solidity shapes (current `MpcCore`)

| Family | Narrow lanes (`8`–`128`) | 256-bit |
| --- | --- | --- |
| `ct*` | `type ctUint* is uint256` (single word) | `struct { ctUint128 ciphertextHigh; ctUint128 ciphertextLow; }` |
| `gt*` | `type gtUint* is uint256` | `struct { gtUint128 high; gtUint128 low; }` |
| `it*` | struct: ciphertext + `bytes` signature | struct: ciphertext + `bytes[2][2]` signature |

Off-chain: narrow `ct*` → `bigint` or hex; `ctUint256` → `{ ciphertextHigh, ciphertextLow }`.

## Critical gotcha: EVM `it*` → COTI `gt*`

Custom COTI functions invoked through the Inbox must declare **`gt*`** parameters, not `it*`. The pipeline validates `it*` and re-encodes to `gt*` before COTI invocation.

## Boundary rules

1. Accept private user input as `it*` on EVM methods.
2. Forward via Inbox (`sendTwoWayMessage` / `sendOneWayMessage`).
3. Compute on COTI with `gt*`.
4. Return `ct*` in callback `abi.encode(...)`.
5. Decode callback into `ct*` and persist; client decrypts locally.

## PodLib width coverage

- `PodLib64` / `PodLib128` / `PodLib256` — arithmetic, compare, bitwise, mux, shift, randomness.
- Callback decode width must match the primitive (`ctUint64` vs `ctUint256`, etc.).

## COTI conversion patterns

- `ct → gt`: `MpcCore.onBoard(...)`
- `gt → ct` (contract): `MpcCore.offBoard(...)`
- `gt → ct` (user): `MpcCore.offBoardToUser(..., user)`

## Interface alignment

- `MpcAbiCodec` selector and argument order match COTI target function.
- Callback `abi.decode` matches COTI `abi.encode` exactly.
- Custom flows: verify `inboxMsgSender()` matches expected COTI peer.

## Common failure modes

- `gt*` in EVM-visible APIs.
- Wrong callback decode tuple or width.
- Missing `onlyInbox` on callbacks.
- Treating async PoD as synchronous return.
- Decrypting `ctUint256` with narrow-lane `DataType` (use `Uint256` + two limbs).
