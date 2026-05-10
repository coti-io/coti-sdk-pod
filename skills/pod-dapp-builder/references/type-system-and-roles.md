# Type System And Roles

## Purpose

Use this reference to map data across client, EVM, and COTI boundaries without leaking sensitive information or breaking ABI compatibility.

## Canonical Type Meanings

- `it*` types:
  - Treat as encrypted + signed user input.
  - Accept on EVM-facing entrypoints.
  - Forward to COTI/private execution entrypoints.
  - Common examples: `itBool`, `itUint64`, `itUint128`, `itUint256`.

- `ct*` types:
  - Treat as encrypted output for a specific user (user AES key context).
  - Store/return on EVM side when user-readable private results are required.
  - Use for callback payloads consumed by frontends/wallet flows.
  - Common examples: `ctBool`, `ctUint64`, `ctUint128`, `ctUint256`.

- `gt*` types:
  - Treat as COTI-only internal private compute values.
  - Use only in COTI-side smart contracts and MPC core logic.
  - Do not expose directly on EVM/public interfaces.
  - Common examples: `gtBool`, `gtUint64`, `gtUint128`, `gtUint256`.

- Public Solidity types:
  - Keep non-private metadata/control fields public (`address`, `uint`, `bytes32`, enums).
  - Avoid storing sensitive business values in plaintext.

## Boundary Rules

1. Accept private user input as `it*` on EVM methods.
2. Encode and forward requests via Inbox (`sendTwoWayMessage` or `sendOneWayMessage`).
3. Perform private operations in COTI context with `gt*`.
4. Convert COTI results to `ct*` before responding to EVM.
5. Decode callback payloads into `ct*`/public fields and persist them.

## Width And Operation Coverage

- `PodLib` composes width-specific helpers:
  - `PodLib64` for 64-bit operations.
  - `PodLib128` for 128-bit operations.
  - `PodLib256` for 256-bit operations.
- Operations include arithmetic, comparisons, bitwise, mux, shifts, and randomness dispatch methods.
- Keep callback decode types aligned with the selected operation width.

## COTI Conversion Patterns

- `ct -> gt`: `MpcCore.onBoard(cipher)`
- `gt -> ct` (contract-held ciphertext): `MpcCore.offBoard(value)`
- `gt -> ct` (user-targeted ciphertext): `MpcCore.offBoardToUser(value, user)`
- Public literal to private compute value: `MpcCore.setPublic64(x)` or matching width helper

## Interface Alignment Rules

- Keep EVM-side method call selector and COTI-side function signature strictly aligned.
- Keep argument order identical across `MpcAbiCodec` and target COTI function.
- Keep callback `abi.decode(...)` layout identical to COTI `abi.encode(...)` layout.
- Include result owner/user address whenever converting compute result to user `ct*`.

## Common Failure Modes

- Using `gt*` in EVM-visible interfaces.
- Returning raw `gt*` from COTI to EVM callback.
- Forgetting `onlyInbox` on callbacks.
- Decoding callback payload with wrong tuple layout.
- Treating asynchronous result as immediate return value.
