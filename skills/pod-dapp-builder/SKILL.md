---
name: pod-dapp-builder
description: Build new PoD (privacy-on-demand) applications and migrate existing non-private Solidity applications to COTI async privacy architecture. Use when working on contracts that must introduce `it*`, `ct*`, or `gt*` encrypted types; split logic between EVM and COTI sides; add Inbox one-way/two-way messaging; implement callback-based async flows; budget execution/callback fees; or refactor synchronous contract behavior into request/response state machines.
---

# PoD dApp Builder

## Overview

Implement or refactor Solidity contracts into PoD architecture with correct encrypted type usage, async request handling, and fee budgeting. Prefer existing `PodLib.sol` + COTI executor flows when possible; implement custom COTI-side privacy logic only when library coverage is insufficient.

## Quick Start Workflow

1. Classify each variable and function boundary using `it*`, `ct*`, `gt*`, or public types.
2. Choose integration mode:
   - Use library mode (`PodLib.sol`/`PodLibBase.sol` + existing COTI executor methods) for supported operations.
   - Use custom mode (new EVM + COTI contracts) for unsupported privacy business logic.
3. Convert synchronous flows into async request/response:
   - Create request on EVM side via Inbox.
   - Persist request correlation state.
   - Handle callback/error callbacks via `onlyInbox`.
4. Budget fees for remote execution and callback (two-way) before dispatch.
5. Return user-readable encrypted outputs as `ct*`; keep in-contract/private computation as `gt*`.
6. Verify callback decoding, request ID tracking, failure paths, and fee sufficiency.

## Choose Type Semantics

- Use `it*` for user-provided encrypted/signed inputs sent from client or EVM into privacy execution.
- Use `ct*` for ciphertext returned to or stored for a specific user (AES user key protected).
- Use `gt*` only on COTI chain for in-contract private computation with chain-level encryption.
- Use public Solidity types only for non-private metadata and control flow.

Read `references/type-system-and-roles.md` when mapping legacy state/parameters to encrypted types.

## Implement EVM-Side Contract Patterns

- Extend `PodLib` when using built-in privacy methods.
- Use `PodLibBase` for fee-aware helper behavior and default remote error surfacing.
- Prefer width-specific operations already exposed by `PodLib` (`PodLib64`, `PodLib128`, `PodLib256`), including arithmetic, comparisons, bitwise ops, mux, shifts, and randomness flows.
- Build method calls via `MpcAbiCodec` and call Inbox:
  - `sendTwoWayMessage(..., callbackFeeLocalWei)` for request+callback RPC-like flows.
  - `sendOneWayMessage` for fire-and-forget cross-chain messages.
- Restrict callbacks with `onlyInbox`.
- Decode callback payload into `ct*`/public outputs and persist them.
- Track correlation state:
  - Map business keys to `requestId`.
  - In callback, prefer `inbox.inboxSourceRequestId()`, fallback to `inbox.inboxRequestId()`.
- Handle remote failures with `onDefaultMpcError` or custom error selector.

Use these repository examples as implementation anchors:
- `contracts/examples/it128/PodAdder128.sol`
- `contracts/examples/it256/PodAdder256.sol`
- `contracts/examples/pod/PodTest64.sol`
- `contracts/examples/pod/PodTest128.sol`
- `contracts/examples/pod/PodTest256.sol`
- `contracts/examples/millionaire/Millionaire.sol`
- `contracts/examples/perc20/PErc20.sol`

## Fees (Mandatory)

- Treat fees as part of correctness, not an optional optimization.
- Two-way PoD execution requires paying for:
  - Remote execution leg.
  - Callback leg (response/error back to source chain).
- Pay fees in local native gas token (for example ETH on EVM).
- Use Inbox fee estimation before sending:
  - `calculateTwoWayFeeRequiredInLocalToken(remoteMethodCallSize, callBackMethodCallSize, remoteMethodExecutionGas, callBackMethodExecutionGas, gasPrice)`
- Pass total payment as `msg.value` and callback slice as `callbackFeeLocalWei` when using two-way send helpers.
- Remember that inbox internally tracks local/remote gas token prices and converts to gas-unit budgets.
- For practical planning, use same gas price assumption for forward and callback legs unless the user explicitly chooses a different model.

Read `references/fees-and-pricing.md` before implementing new request paths or refactoring old synchronous logic.

## Implement COTI-Side Privacy Patterns

- Build privacy logic on COTI side when shared executor methods are insufficient.
- Use `gt*` for all intermediate private math/comparisons.
- Convert values across boundaries deliberately:
  - `ct* -> gt*`: `MpcCore.onBoard(...)`
  - `gt* -> ct*` for contract storage: `MpcCore.offBoard(...)`
  - `gt* -> ct*` for user-specific result: `MpcCore.offBoardToUser(..., user)`
- Respond using `inbox.respond(abi.encode(...))` for two-way responses.
- Keep EVM and COTI interfaces aligned by selector and ordered ABI encoding.

Use this repository example for custom COTI execution:
- `contracts/examples/perc20/PErc20Coti.sol`

## Convert Existing Non-PoD Contracts

1. Split legacy business logic:
   - Keep non-sensitive/public logic on EVM side.
   - Move sensitive/private operations to COTI side or shared executor methods.
2. Replace sync returns with async lifecycle:
   - Emit request events.
   - Store pending state keyed by request ID.
   - Fulfill state in callback.
3. Refactor storage model:
   - Replace plaintext sensitive storage with `ct*` or COTI-side `gt*`.
4. Update interfaces and tests:
   - Expect eventual completion via callback/event instead of immediate return.
5. Preserve backward-compatible public APIs when possible by exposing query functions for latest completed ciphertext/result state.

Read `references/conversion-playbook.md` for a concrete migration checklist and async state machine template.

## Delivery Checklist

- Ensure each privacy operation has explicit type mapping (`it`/`ct`/`gt`/public).
- Ensure every callback/error handler is `onlyInbox`.
- Ensure request IDs are captured and correlated to domain state.
- Ensure callback ABI decode matches exact COTI response layout.
- Ensure fee estimation and budgeting is explicit (`msg.value`, `callbackFeeLocalWei`, and calculator usage).
- Ensure two-way paths reserve callback fee and do not underfund response legs.
- Ensure at least one negative-path test covers remote error handling.
- Ensure at least one negative-path test covers fee-underfunding/revert behavior.
- Ensure docs or comments explain that PoD calls are asynchronous.

## References

- `references/type-system-and-roles.md`
- `references/conversion-playbook.md`
- `references/fees-and-pricing.md`
