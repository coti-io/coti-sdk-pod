# Examples with description

This page explains what each shipped example teaches and what you must add for production.

## `MpcAdder.sol`

Path: `/contracts/examples/MpcAdder.sol`

What it demonstrates:

- Minimal `PodLib` usage.
- Payable request submission with `add64`, passing **`msg.value`** and **`callbackFeeLocalWei`**.
- Callback decode and encrypted result storage (`ctUint64`).

What to add in production:

- request ownership mapping,
- explicit request status tracking,
- stronger event coverage for completion/failure,
- fee estimation (`calculateTwoWayFeeRequiredInLocalToken`) and tests for under-funded sends (see `/docs/contracts/04-fees-gas-and-oracle.md`).

## `Millionaire.sol`

Path: `/contracts/examples/millionaire/Millionaire.sol`

What it demonstrates:

- User registration with `itUint64` encrypted wealth.
- Two directional **`gt64`** requests for pair comparison, each with its own **`msg.value`** share and **`callbackFeeLocalWei`**.
- Request ID correlation and callback request-id recovery pattern.

What to add in production:

- access policy for who can trigger comparisons,
- anti-spam/rate limiting controls,
- result lifecycle and retention policy.

## `PErc20.sol` (EVM)

Path: `/contracts/examples/perc20/PErc20.sol`

What it demonstrates:

- Custom method payload construction through `MpcAbiCodec`.
- Payable two-way send via `_sendTwoWayWithFee` with explicit callback slice.
- Callback decode of multi-value tuple and encrypted balance updates.
- EVM `it*` request arguments being consumed as `gt*` parameters on COTI side.

What to add in production:

- full token semantics (allowances, events, compliance with required interfaces),
- access controls and admin controls,
- robust balance/query APIs for clients.

## `PErc20Coti.sol` (COTI)

Path: `/contracts/examples/perc20/PErc20Coti.sol`

What it demonstrates:

- Converting stored ciphertext to compute domain (`onBoard`).
- Private arithmetic on `gt*` values.
- Converting outputs for storage (`offBoard`) and for users (`offBoardToUser`).
- Returning ABI tuple through `inbox.respond(...)`.
- Correct COTI function signature design for arguments received from EVM request builder (`gt*`, not `it*`).

What to add in production:

- stronger validation and error semantics,
- replay protections and idempotency checks,
- complete auditing of private transfer invariants.

## Suggested study order

1. `MpcAdder.sol`
2. `Millionaire.sol`
3. `PErc20.sol` + `PErc20Coti.sol`

This order mirrors complexity growth from minimal callback flow to full split-architecture logic.
