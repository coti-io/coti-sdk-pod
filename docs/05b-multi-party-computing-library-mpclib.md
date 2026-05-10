# Multi-party Computing library (MpCLib)

Source: `/contracts/mpc/PodLib.sol` (64/128/256-bit logic in `PodLib64.sol`, `PodLib128.sol`, `PodLib256.sol`)

`PodLib` is the EVM-side helper for built-in COTI private methods. It inherits `PodLibBase`, which forwards **total** and **callback** native fees to `IInbox.sendTwoWayMessage`.

## Network presets with `PodLib` (`PodUserSepolia`, …)

For a **known network deployment**, the SDK may provide a small mixin such as `PodUserSepolia` (`/contracts/mpc/PodUserSepolia.sol`) with `internal constant` inbox address, COTI chain id, and MPC executor address.

That mixin is intentionally **not** a second `PodUser` subclass, so it composes with `PodLib` without fighting constructor linearization. Declare:

```text
contract MyApp is PodLib, PodUserSepolia
```

Then in the constructor run `PodLibBase(initialOwner)` and call `setInbox(INBOX_ADDRESS)` and `configureCoti(MPC_EXECUTOR_ADDRESS, COTI_CHAIN_ID)` (the constants come from `PodUserSepolia`). See `/docs/04-getting-started.md` for a full snippet.

Add the same pattern for other chains as new preset files appear in `/contracts/mpc/`.

## What it does

- Builds method payloads with `MpcAbiCodec`.
- Routes messages to configured COTI executor (`mpcExecutorAddress`, `cotiChainId`).
- Sends two-way Inbox requests with callback and error selectors and **explicit fee arguments** (`totalValueWei`, `callbackFeeLocalWei`).
- Provides default error handler `onDefaultMpcError(bytes32 requestId)`.

Important mapping behavior:

- EVM calls `PodLib` helpers with `it*` input arguments.
- COTI-side common methods are defined with `gt*` parameters (`IPodExecutorOps` family).
- Request re-encoding/validation converts `it*` payloads into `gt*` ABI arguments before COTI invocation.

## Available built-in methods (64-bit examples)

`PodLib64` exposes arithmetic and comparison helpers such as:

- `add64`, `sub64`, `mul64`, `div64`, `rem64`
- `gt64`, bitwise `and64` / `or64` / `xor64`, and others

Each follows the same fee-aware shape (internal functions):

```solidity
function add64(
    itUint64 memory a,
    itUint64 memory b,
    address cOwner,
    bytes4 callbackSelector,
    bytes4 errorSelector,
    uint256 totalValueWei,
    uint256 callbackFeeLocalWei
) internal returns (bytes32);
```

128- and 256-bit variants live on `PodLib128` / `PodLib256`. See the source files for the full matrix.

## Fees

Library sends always go through `_sendTwoWayWithFee`:

- **`totalValueWei`** – forwarded as `msg.value` to the Inbox (entire budget for the message).
- **`callbackFeeLocalWei`** – slice of that total reserved for the callback leg.

See [Fees, gas, and oracle](contracts/04-fees-gas-and-oracle.md) for configuration, `calculateTwoWayFeeRequiredInLocalToken`, and the difference between total and callback fee.

## Integration example

```solidity
import "@coti/pod-sdk/contracts/mpc/PodLib.sol";
import "@coti/pod-sdk/contracts/mpc/PodLibBase.sol";

contract MyContract is PodLib, PodUserSepolia {
    address public owner;

    modifier onlyOwner() { require(msg.sender == owner, "only owner"); _; }

    function privateAdd(
        itUint64 calldata a,
        itUint64 calldata b,
        uint256 callbackFeeLocalWei
    ) external payable {
        bytes32 requestId = add64(
            a,
            b,
            msg.sender,
            this.privateAddCallback.selector,
            this.onDefaultMpcError.selector,
            msg.value,
            callbackFeeLocalWei
        );
        emit PrivateAddRequested(requestId);
    }

    function privateAddCallback(bytes memory data) external onlyInbox {
        ctUint64 out = abi.decode(data, (ctUint64));
        // store result
    }

    event PrivateAddRequested(bytes32 indexed requestId);
}
```

## When to move beyond `PodLib`

Use custom EVM + COTI contracts when:

- operation is not one of built-ins,
- callback payload is a custom tuple,
- COTI logic requires multiple private compute steps and state.
