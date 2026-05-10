# Contract data types: `it*`, `ct*`, and `gt*`

Canonical source: `/contracts/utils/mpc/MpcCore.sol`

This file explains how each type family is defined and where it is valid.

## Why the split exists

PoD needs separate representations for:

- user-submitted encrypted input,
- user-readable encrypted output,
- private compute-domain values.

Mixing them incorrectly can break callback decode, signature validation, or privacy guarantees.

## Type family overview

## `it*` (input payload)

Purpose:

- carry user-provided encrypted value plus signature material.

Where valid:

- EVM entrypoints for private method calls,
- payloads encoded through `MpcAbiCodec`.

Full declared `it*` input types:

| Type | Solidity declaration shape | Typical use |
|---|---|---|
| `itBool` | `{ ctBool ciphertext; bytes signature; }` | Signed encrypted bool input |
| `itUint8` | `{ ctUint8 ciphertext; bytes signature; }` | Signed encrypted 8-bit input |
| `itUint16` | `{ ctUint16 ciphertext; bytes signature; }` | Signed encrypted 16-bit input |
| `itUint32` | `{ ctUint32 ciphertext; bytes signature; }` | Signed encrypted 32-bit input |
| `itUint64` | `{ ctUint64 ciphertext; bytes signature; }` | Signed encrypted 64-bit input |
| `itUint128` | `{ ctUint128 ciphertext; bytes[2] signature; }` | Signed encrypted 128-bit input |
| `itUint256` | `{ ctUint256 ciphertext; bytes[2][2] signature; }` | Signed encrypted 256-bit input |
| `itString` | `{ ctString ciphertext; bytes[] signature; }` | Signed encrypted string input |

## `ct*` (ciphertext output)

Purpose:

- encrypted value to store/return on EVM and decrypt client-side with account AES key.

Where valid:

- EVM contract storage,
- callback payload decoding,
- EVM read APIs.

Full declared `ct*` ciphertext types:

| Type | Solidity declaration shape | Typical use |
|---|---|---|
| `ctBool` | `type ctBool is uint256;` | Encrypted bool result |
| `ctUint8` | `type ctUint8 is uint256;` | Encrypted 8-bit result |
| `ctUint16` | `type ctUint16 is uint256;` | Encrypted 16-bit result |
| `ctUint32` | `type ctUint32 is uint256;` | Encrypted 32-bit result |
| `ctUint64` | `type ctUint64 is uint256;` | Encrypted 64-bit result |
| `ctUint128` | `struct { ctUint64 high; ctUint64 low; }` | Encrypted 128-bit result |
| `ctUint256` | `struct { ctUint128 high; ctUint128 low; }` | Encrypted 256-bit result |
| `ctString` | `struct { ctUint64[] value; }` | Encrypted string cells |

## `gt*` (private compute-domain value)

Purpose:

- private execution representation used in COTI-side compute path.

Where valid:

- COTI-side private contracts and operations.

Full declared `gt*` compute-domain types:

| Type | Solidity declaration shape | Typical use |
|---|---|---|
| `gtBool` | `type gtBool is uint256;` | Private bool compute |
| `gtUint8` | `type gtUint8 is uint256;` | Private 8-bit compute |
| `gtUint16` | `type gtUint16 is uint256;` | Private 16-bit compute |
| `gtUint32` | `type gtUint32 is uint256;` | Private 32-bit compute |
| `gtUint64` | `type gtUint64 is uint256;` | Private 64-bit compute |
| `gtUint128` | `struct { gtUint64 high; gtUint64 low; }` | Private 128-bit compute |
| `gtUint256` | `struct { gtUint128 high; gtUint128 low; }` | Private 256-bit compute |
| `gtString` | `struct { gtUint64[] value; }` | Private string compute |

## Conversion operations

From `MpcCore`:

- `onBoard(ct*) -> gt*`
- `offBoard(gt*) -> ct*`
- `offBoardToUser(gt*, address) -> ct*`

Intent:

- `onBoard` to move ciphertext into compute domain.
- `offBoard` for contract-held ciphertext.
- `offBoardToUser` for user-targeted decryptable ciphertext.

## End-to-end boundary flow

1. Client builds `it*`.
2. EVM accepts `it*` and sends request.
3. `MpcAbiCodec.reEncodeWithGt(...)` validates and converts `it*` to `gt*` argument shape.
4. COTI logic computes on `gt*`.
5. COTI returns `ct*`.
6. EVM callback stores `ct*`.
7. Client decrypts `ct*` with account AES key.

## Critical gotcha: EVM `it*` argument maps to COTI `gt*` parameter

For custom COTI-side business logic, the type at the two boundaries is intentionally different:

- EVM contract function accepts `it*` (for example `itUint64`).
- COTI contract function must be declared with matching `gt*` (for example `gtUint64`).

Example mapping:

- EVM request side: `process(itUint64 amount)`
- COTI execution side: `process(gtUint64 amount)`

Why:

- request payload includes encrypted user input with signature (`it*`),
- request pipeline validates and converts that payload to compute-domain value (`gt*`) before COTI contract invocation.

If you declare COTI function parameter as `it*` for a method that is invoked through this flow, decoding/ABI expectations will not match.

## `MpcAbiCodec` type mapping notes

`/contracts/mpccodec/MpcAbiCodec.sol` includes `MpcDataType` variants for:

- public/system types (`UINT256`, `ADDRESS`, etc.),
- private input types (`IT_BOOL`, `IT_UINT8`, `IT_UINT16`, `IT_UINT32`, `IT_UINT64`, `IT_UINT128`, `IT_UINT256`, `IT_STRING`).

For `IT_*` values, `_normalizeArg(...)` decodes and calls `MpcCore.validateCiphertext(...)` before re-encoding into compute-domain ABI layout.

## String representation details

`ctString` and `gtString` are arrays of 64-bit cells (`*Uint64[]`).

- Each cell represents 8 bytes.
- Last cell is zero-padded as needed.

## Required usage rules

1. EVM private input parameters should be `it*`.
2. EVM private result storage/returns should be `ct*`.
3. COTI private compute should use `gt*`.
4. Do not expose `gt*` in EVM public interfaces.
5. Keep width consistent (for example `uint64` path should stay `itUint64 -> gtUint64 -> ctUint64`).

## Allowed/forbidden quick examples

Allowed:

- `function submit(itUint64 calldata x) external`
- `mapping(bytes32 => ctUint64) public resultByRequest`
- `gtUint64 z = MpcCore.add(x, y)` on COTI side

Forbidden:

- `function submit(gtUint64 x) external` on EVM contract
- decoding callback tuple as wrong `ct*` type
- using plaintext `uint256` storage for data intended to remain private

## Related `ut*` structs

`MpcCore` also defines `ut*` structs (for example `utUint64`) containing both contract ciphertext and user ciphertext.

These are helper container types in the library. They are not the primary external input type family for EVM entrypoints.

## Practical mapping examples

| Contract parameter/result | Client operation | COTI operation |
|---|---|---|
| `itUint64` function arg | build signed encrypted uint64 input | validated and re-encoded to `gtUint64` |
| `itString` function arg | build signed encrypted string cells | validated and re-encoded to `gtString` |
| callback `ctBool` | decrypt with bool type | produced from private bool compute |
| callback `ctString` | decrypt with string type | produced from private string compute |

## Frequent mistakes

- using wrong key/type combination when decrypting client-side,
- mismatch between frontend type and Solidity type width,
- forgetting `offBoardToUser` for user-targeted outputs,
- skipping request-id correlation in callback handling.
