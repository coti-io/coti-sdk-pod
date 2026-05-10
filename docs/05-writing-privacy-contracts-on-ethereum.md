# Writing privacy contracts on Ethereum

This guide defines the EVM-side design model for PoD contracts.

## 1. Classify each value before writing code

For each input, output, and state field, classify as:

- public metadata (`address`, `uint`, `bytes32`, enums),
- private user input (`it*`),
- private user-readable output (`ct*`),
- COTI compute-domain value (`gt*`, COTI side only).

Reference: `/docs/contracts/01-it-ct-gt-data-types.md`.

## 2. Pick integration mode

## Library mode

Use `PodLib` when your operation is covered by the built-in executor ops (for example `add64`, `gt64`, and other helpers in `PodLib64` / `PodLib128` / `PodLib256`).

You implement EVM request/callback logic only. Entrypoints that send two-way messages must be **payable** and pass **`totalValueWei`** (typically `msg.value`) and **`callbackFeeLocalWei`** into the library helper. See [Fees, gas, and oracle](contracts/04-fees-gas-and-oracle.md).

On a network that ships a preset mixin (e.g. `PodUserSepolia`), prefer **`contract App is PodLib, PodUserSepolia`** and wire `setInbox` / `configureCoti` from the mixin constants in the constructor (see `/docs/04-getting-started.md`).

## Custom mode

Use `MpcAbiCodec` + a COTI-side contract when operation is not covered by `PodLib`.

You must define and maintain:

- request selector + argument order,
- COTI function signature,
- callback tuple schema.

## 2.1 Critical type-mapping gotcha for custom COTI methods

When you call custom COTI-side business logic through Inbox:

- EVM-side contract arguments are usually `it*`.
- COTI-side method parameters must be the corresponding `gt*`.

Concrete example:

- EVM side request builder passes `amount` as `itUint64`.
- COTI-side target function should be declared as `amount gtUint64`.

This mapping is easy to confuse and is one of the most common integration mistakes.
Reference details: `/docs/contracts/01-it-ct-gt-data-types.md`.

## 3. Convert synchronous logic into async state machine

Private operations are async:

1. Submit request.
2. Store correlation state by `requestId`.
3. Handle callback.
4. Handle failures.

Recommended storage primitives:

- `mapping(bytes32 => RequestStatus)`
- `mapping(bytes32 => ResultType)`
- business-key to request mapping.

## 4. Enforce callback boundary

- Use `onlyInbox` on callback and error handlers.
- Decode callback bytes with exact tuple shape.
- Reject or safely handle unknown request IDs.

## 5. Secure configuration paths

Routing is updated through **`PodUser.configure(...)`**, which is **`onlyOwner`** in this SDK.

Production guidance:

- keep the owner account or role model explicit (multisig, timelock, etc.),
- emit config change events from your app contract when you add wrappers,
- avoid ad-hoc `setInbox` / executor changes without governance.

## 6. Design UX-safe read APIs

Expose async-friendly APIs:

- request submission event with indexed `requestId`,
- status reader (`pending/completed/failed`),
- ciphertext result reader (`ct*`) for client decryption.

Do not design private operations around immediate return values.

## 7. Keep ABI stable

For request and callback payloads:

- keep argument order deterministic,
- version schemas when changing tuple layouts,
- update EVM decode and COTI encode together.

## 8. Testing requirements

Minimum test set:

- callback success path updates expected state,
- callback call from non-Inbox reverts,
- error path emits useful diagnostics,
- request mapping points to correct domain entity,
- decryptability of resulting `ct*` values in integration flow.

## 9. Deployment readiness

- Inbox address set correctly per network.
- COTI executor and chain ID configured.
- config functions access-controlled.
- events cover request creation, completion, and failure.
- Fee and oracle policy understood: operators set `FeeConfig` and price oracle on `InboxMiner`; apps supply sufficient `msg.value` and `callbackFeeLocalWei` (see `/docs/contracts/04-fees-gas-and-oracle.md`).

Related docs:

- `/docs/05a-async-execution.md`
- `/docs/05b-multi-party-computing-library-mpclib.md`
- `/docs/contracts/02-contract-patterns-and-checklist.md`
- `/docs/contracts/04-fees-gas-and-oracle.md`
