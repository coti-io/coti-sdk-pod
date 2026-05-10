# Showcase

Reference examples are under `/contracts/examples`.

## Example matrix

| Example | Contract(s) | What it demonstrates |
|---|---|---|
| MPC Adder | `/contracts/examples/MpcAdder.sol` | Minimal library-backed async request and callback storage |
| Millionaire | `/contracts/examples/millionaire/Millionaire.sol` | Request correlation and per-pair comparison result tracking |
| pERC20 (EVM) | `/contracts/examples/perc20/PErc20.sol` | Custom request encoding with `MpcAbiCodec` |
| pERC20 (COTI) | `/contracts/examples/perc20/PErc20Coti.sol` | COTI-side private balance updates and ABI response |

## `MpcAdder.sol`

Key ideas:

- Extend `PodLib`.
- Accept `itUint64` inputs.
- Payable entrypoint passes `msg.value` and `callbackFeeLocalWei` into `add64`.
- Decode callback payload as `ctUint64`.

Use this first if you want the smallest working async private flow.

## `Millionaire.sol`

Key ideas:

- Store encrypted user input (`mapping(address => itUint64)`).
- Submit two `gt` requests (`a > b` and `b > a`) with different owners.
- Track request IDs in a pair map.
- Resolve callback request ID via `inboxSourceRequestId()` fallback to `inboxRequestId()`.

Use this for stateful workflows where results are looked up later.

## `PErc20.sol` + `PErc20Coti.sol`

Key ideas:

- EVM side builds custom request with `MpcAbiCodec`.
- COTI side converts `ct* <-> gt*` and computes private transfer logic.
- COTI side returns tuple payload via `inbox.respond(abi.encode(...))`.
- EVM callback decodes tuple and stores encrypted balances.

Use this when `PodLib` built-ins do not cover your operation and you need a custom COTI contract.

## Production note

These files are architecture references. They are not complete production templates for access control, pausing, upgrade strategy, or operational monitoring.
