# Conversion Playbook

Canonical docs: [contract-patterns-checklist.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/contract-patterns-checklist.md), [cookbook-private-investor-allocations.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/cookbook-private-investor-allocations.md).

## Purpose

Convert synchronous non-private Solidity logic into PoD asynchronous privacy flows.

## Architecture decision

1. **Library-backed** — operation exists in `PodLib` (`add64`, `gt256`, …). EVM contract only; no custom COTI Solidity.
2. **Custom COTI** — unsupported primitives or rich private state. EVM orchestrator + COTI contract via `MpcAbiCodec`.

See [tutorials overview](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/tutorials-privacy-on-demand.md).

## Migration checklist

1. Classify sensitive inputs/state/outputs → `it*` / `ct*` / `gt*` / public.
2. Replace sensitive inputs with `it*` on EVM entrypoints.
3. Move sensitive logic to COTI (`gt*`) or PodLib primitives.
4. Add fee path: estimate with `calculateTwoWayFeeRequiredInLocalToken` or `PodContract.estimateFee`.
5. Replace sync returns with request ID + callback fulfillment.
6. Persist `ct*` for client decrypt; implement `onlyInbox` callbacks and error handlers.
7. Client: `PodContract.extractRequestIds` + `PodRequest.trackRequest` + `CotiPodCrypto.decrypt`.
8. Update tests for async completion and fee underfunding.

## EVM preset wiring

```solidity
import "@coti-io/coti-contracts/contracts/pod/mpc/PodLib.sol";
import "@coti-io/coti-contracts/contracts/pod/mpc/PodUserSepolia.sol";

contract MyApp is PodLib, PodUserSepolia {
    constructor() PodLibBase(msg.sender) {}
}
```

Do **not** call `setInbox` / `configureCoti` manually when using `PodUserSepolia` / `PodUserFuji` — presets handle this in their constructor.

## Async state machine template

```solidity
mapping(bytes32 => address) private _requestOwner;
mapping(bytes32 => ctUint64) private _resultByRequest;

event PrivateOpRequested(bytes32 indexed requestId, address indexed requester);
event PrivateOpCompleted(bytes32 indexed requestId);

function privateOp(
    itUint64 calldata a,
    itUint64 calldata b,
    uint256 callbackFeeLocalWei
) external payable {
    bytes32 requestId = add64(
        a, b, msg.sender,
        this.privateOpCallback.selector,
        this.onDefaultMpcError.selector,
        msg.value,
        callbackFeeLocalWei
    );
    _requestOwner[requestId] = msg.sender;
    emit PrivateOpRequested(requestId, msg.sender);
}

function privateOpCallback(bytes calldata data) external onlyInbox {
    bytes32 requestId = inbox.inboxSourceRequestId();
    if (requestId == bytes32(0)) {
        requestId = inbox.inboxRequestId();
    }
    ctUint64 result = abi.decode(data, (ctUint64));
    _resultByRequest[requestId] = result;
    emit PrivateOpCompleted(requestId);
}
```

## Custom COTI contract template

```solidity
function executePrivate(/* args */) external onlyInbox {
    // gtUint64 x = MpcCore.onBoard(ctX);
    // gtUint64 y = MpcCore.add(x, z);
    // ctUint64 out = MpcCore.offBoardToUser(y, user);
    inbox.respond(abi.encode(out));
}
```

COTI parameters use **`gt*`**, not `it*`. Verify `inboxMsgSender()` on the EVM callback when using split contracts.

## Examples in `@coti-io/coti-contracts`

| Example | Path |
| --- | --- |
| Minimal adder (64-bit) | `contracts/pod/examples/MpcAdder.sol` |
| 128 / 256-bit adders | `contracts/pod/examples/it128/PodAdder128.sol`, `it256/PodAdder256.sol` |
| Callback fault testing | `contracts/pod/examples/MpcAdderPausable.sol` |
| Private tokens | `contracts/pod/token/perc20/`, `token/erc7984/` |

Full walkthrough: [tutorial-private-adder-sepolia.md](https://github.com/coti-io/documentation/blob/main/privacy-on-demand/tutorial-private-adder-sepolia.md).

## TypeScript client flow

```typescript
import { PodContract, PodRequest, CotiPodCrypto, DataType, type PodSdkConfig } from "@coti-io/pod-sdk";

const tracker = new PodRequest(config);
const pod = new PodContract(appAddress, abi, signer, { config });

const tx = await pod.encryptAndCallMethod("add", args, feeCfg);
const receipt = await tx.wait();
const [requestId] = await pod.extractRequestIds(receipt!.hash);

// Poll until terminal state — see typescript-pod-sdk.md
const status = await tracker.trackRequest(chainId, requestId);
```

## Review criteria

- No sync assumption for private ops.
- No plaintext sensitive storage on EVM.
- Observable error path (`onDefaultMpcError`, `PodRequest.execution`).
- Explicit fee assumptions documented.
- Docs link to `documentation/privacy-on-demand/` — not `coti-sdk-pod/docs/`.
