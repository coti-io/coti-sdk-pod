# `@coti/pod-sdk` TypeScript SDK

The `@coti/pod-sdk` package is the canonical client-side library for building
PoD dApps. It covers the three things you need in a frontend or backend
integration:

| Concern | Module | Class / helpers |
|---|---|---|
| Encrypt plaintext for `it*` inputs and decrypt `ct*` results | `src/coti-pod-crypto.ts` | `CotiPodCrypto.encrypt` / `CotiPodCrypto.decrypt` |
| Submit a PoD method call (fee math, encryption, event parsing) | `src/pod-method-call.ts` | `PodContract` |
| Track the async request lifecycle across chains | `src/pod-request.ts` | `PodRequest` |

All three share a small JSON-serialisable config, `PodSdkConfig`, so you write
your chain wiring once and reuse it everywhere.

## What you can do with the SDK

1. **Turn plaintext into signed `it*` payloads** suitable for any PoD contract
   on any deployed chain, via the PoD encryption service. No wallet needed.
2. **Submit a call to a PoD contract** with end-to-end UX handling: fetch the
   inbox fee quote, encrypt the arguments you mark as private, attach the right
   `msg.value`, and send the transaction.
3. **Parse the resulting `MessageSent` events** to obtain the 32-byte inbox
   `requestId`(s) you need to correlate the async flow.
4. **Track each request across source and target chains** until it is mined,
   executed, responded to, or errored — so your UI can show a live status
   (`submitting → pending → executing → completed/failed`).
5. **Decrypt `ct*` callback results** locally with the user's account AES key.

The SDK does **not** provide: wallet onboarding UI, key-share recovery (use
`@coti-io/coti-sdk-typescript` for that, see
[coti-typescript-sdk](06a-coti-typescript-sdk.md)), RPC infrastructure, or
block indexing.

## Installation

```bash
npm install @coti/pod-sdk ethers
```

```typescript
import {
  CotiPodCrypto,
  DataType,
  PodContract,
  PodRequest,
  SEPOLIA_DEFAULT_INBOX_ADDRESS,
  COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  type PodSdkConfig,
  type RequestTrackingResponse,
} from "@coti/pod-sdk";
```

## Shared config

`PodSdkConfig` is plain JSON. Load it from a file, a secret manager, or an env
block — both `PodContract` and `PodRequest` accept the same shape.

```typescript
const config: PodSdkConfig = {
  encryptionNetwork: "testnet", // or "mainnet" or a full service URL
  chains: [
    {
      chainId: 11155111,
      inboxAddress: SEPOLIA_DEFAULT_INBOX_ADDRESS,
      rpcUrl: process.env.SEPOLIA_RPC_URL!,
    },
    {
      chainId: 7082400,
      inboxAddress: COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
      rpcUrl: process.env.COTI_TESTNET_RPC_URL!,
    },
  ],
};
```

Fields:

- **`chainId`** – EIP-155 chain id.
- **`inboxAddress`** – deployed PoD inbox on that chain.
- **`rpcUrl`** – JSON-RPC endpoint used for read calls in `PodRequest` and fee
  estimation in `PodContract`.
- **`encryptionNetwork`** – `"testnet"` / `"mainnet"` keyword or a full URL for
  `CotiPodCrypto.encrypt`.

`PodContract` uses `config.chains` to resolve its inbox address from the
connected signer's chain id and falls back to `DEFAULT_INBOX_ADDRESS_BY_CHAIN_ID`
when a chain isn't listed. `PodRequest` uses the list to build a read-only
provider + inbox contract per chain on first touch.

## `CotiPodCrypto` — encryption and decryption

See [Encrypt / decrypt](06b-encrypt-decrypt.md) for the full reference. At a
glance:

```typescript
const enc = await CotiPodCrypto.encrypt("42", "testnet", DataType.Uint64);
// → { ciphertext: "0x...", signature: "0x..." }

const plain = CotiPodCrypto.decrypt(ctHexFromContract, aesKey, DataType.Uint64);
// → "42"
```

`PodContract.encryptAndCallMethod(...)` calls `CotiPodCrypto.encrypt` under the
hood for every argument typed as `itBool`/`itUint*`/`itString`, so most app code
never calls `encrypt` directly. Use it manually when you need to prepare
payloads outside of a direct contract call (for example, precompute inputs
inside a Web Worker).

## `PodContract` — submitting PoD method calls

`PodContract` wraps an `ethers.Contract` and layers on:

- inbox fee estimation via `calculateTwoWayFeeRequiredInLocalToken`,
- optional encryption of `it*` arguments via `CotiPodCrypto`,
- automatic `msg.value` attachment based on the fee quote,
- an `extractRequestIds` helper that parses the inbox's `MessageSent` events
  from a transaction receipt.

```typescript
const pod = new PodContract(APP_ADDRESS, APP_ABI, signer, { config });

const feeCfg = {
  forwardGasLimit: 1_500_000n,
  callBackGasLimit: 400_000n,
  gasPrice: (await signer.provider!.getFeeData()).gasPrice!,
  // callBackDataSize is optional; derive with estimateForwardDataSizeFromArguments when needed
};

const tx = await pod.encryptAndCallMethod(
  "compare",
  [
    { type: DataType.itUint64, value: "10", isCallBackFee: false },
    { type: DataType.itUint64, value: "20", isCallBackFee: false },
    // one Uint256 arg is flagged as the callback-fee slot — PodContract will
    // overwrite its value with the computed `callBackFee` before sending.
    { type: DataType.Uint256,  value: "0",  isCallBackFee: true },
  ],
  feeCfg
);

const receipt = await tx.wait();
const requestIds = await pod.extractRequestIds(receipt!.hash);
```

Key methods:

- **`encryptAndCallMethod(method, args, feeCfg)`** – encrypt every `it*` arg and
  submit. Use this from the frontend when the user provides plaintext.
- **`callMethod(method, args, feeCfg)`** – submit with pre-built `it*` JSON
  ciphertext strings (the user or a prior step already produced the signed
  inputs). Useful for backends or Web Workers.
- **`estimateFee(method, args, feeCfg)`** – returns
  `{ totalFee, remoteFee, callBackFee }`, all in local wei, using the inbox
  fee oracle. Run it first if you need to surface the cost before prompting for
  signature.
- **`extractRequestIds(txHash)`** – read the receipt, decode every
  `MessageSent` event emitted by the configured inbox, and return the
  corresponding 32-byte request ids in order.

`feeCfg.isCallBackFee` on a single argument marks the slot into which
`PodContract` writes the computed callback fee (see
[Fees, gas, and oracle](contracts/04-fees-gas-and-oracle.md)).

## `PodRequest` — tracking the async lifecycle

Once you have a `requestId`, reconstruct its current state across both inboxes
by calling `trackRequest(chainId, requestId)` on a `PodRequest` instance. It is
designed to be polled: every call issues a few `eth_call`s in parallel and
returns a fresh snapshot. Stop polling when your UI reaches a terminal state.

```typescript
const tracker = new PodRequest(config);
const status: RequestTrackingResponse = await tracker.trackRequest(
  11155111n, // source chain (where the request was emitted)
  requestId
);
```

`RequestTrackingResponse` fields:

| Field | Type | Meaning |
|---|---|---|
| `requestId` | `string` | 32-byte packed id (`bytes32`). |
| `sourceChainId` | `bigint` | Chain that emitted the outbound request. |
| `targetChainId` | `bigint` | Chain that executes the request. |
| `timestamp` | `bigint` | Source-chain block timestamp of creation. |
| `isTwoWay` | `boolean` | `true` when a callback is expected. |
| `minedOnTarget` | `boolean` | `true` once the target inbox ingested the request. |
| `remoteGasLimit` | `bigint` | `Request.targetFee` — gas-unit budget for the remote execution. |
| `localGasLimit` | `bigint` | `Request.callerFee` — gas-unit budget for the callback leg. |
| `execution` | `{ errorCode, errorMessage, errorMessageRaw } \| null` | Populated when encode / subcall failed on the target inbox. See `ERROR_CODE_EXECUTION_FAILED` (1) and `ERROR_CODE_ENCODE_FAILED` (2). |
| `response` | `RequestTrackingResponse \| null` | Recursive tracking of the target → source response request (two-way flows only). |

For two-way flows, a completed round-trip looks like:

```
status.isTwoWay                   === true
status.minedOnTarget              === true   // executed on COTI
status.response                   !== null   // response request emitted
status.response.minedOnTarget     === true   // callback executed on source
```

For a one-way request, you only need `status.minedOnTarget` (optionally
combined with `status.execution`).

Useful constants:

- `ERROR_CODE_EXECUTION_FAILED = 1n` – target-contract call reverted.
- `ERROR_CODE_ENCODE_FAILED    = 2n` – MPC re-encoding of calldata failed
  before the call could be made.

`decodeInboxErrorMessage(rawHex)` is exported separately and is the same helper
`PodRequest` uses internally: it tries `Error(string)`, then `Panic(uint256)`,
then UTF-8, then returns the raw hex.

## End-to-end example: submit, track, update UI

Pseudo-code for a typical dApp page that asks the user for two private numbers,
compares them privately on COTI, and displays the decrypted boolean result.

```typescript
import {
  CotiPodCrypto,
  DataType,
  PodContract,
  PodRequest,
  SEPOLIA_DEFAULT_INBOX_ADDRESS,
  COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  type PodSdkConfig,
} from "@coti/pod-sdk";
import { ethers } from "ethers";

const config: PodSdkConfig = {
  encryptionNetwork: "testnet",
  chains: [
    { chainId: 11155111, inboxAddress: SEPOLIA_DEFAULT_INBOX_ADDRESS, rpcUrl: SEPOLIA_RPC },
    { chainId: 7082400,  inboxAddress: COTI_TESTNET_DEFAULT_INBOX_ADDRESS, rpcUrl: COTI_RPC },
  ],
};

// Long-lived tracker: reused across many submissions.
const tracker = new PodRequest(config);

async function compareAndWait(
  ui: UiController,
  signer: ethers.Signer,
  aesKey: string,
  aPlain: string,
  bPlain: string
): Promise<boolean> {
  // 1. Wrap the app contract.
  const pod = new PodContract(COMPARE_APP_ADDRESS, COMPARE_APP_ABI, signer, { config });

  // 2. Price + submit. PodContract encrypts the two itUint64 args, computes
  //    the callback fee, and sets msg.value automatically.
  ui.setStatus("submitting");
  const feeData = await signer.provider!.getFeeData();
  const tx = await pod.encryptAndCallMethod(
    "compare",
    [
      { type: DataType.itUint64, value: aPlain,  isCallBackFee: false },
      { type: DataType.itUint64, value: bPlain,  isCallBackFee: false },
      { type: DataType.Uint256,  value: "0",     isCallBackFee: true },
    ],
    {
      forwardGasLimit: 1_500_000n,
      callBackGasLimit: 400_000n,
      gasPrice: feeData.gasPrice!,
    }
  );
  const receipt = await tx.wait();

  // 3. Extract the 32-byte requestId from the inbox's MessageSent event.
  const [requestId] = await pod.extractRequestIds(receipt!.hash);
  const { chainId } = await signer.provider!.getNetwork();
  ui.setStatus("pending", { requestId });

  // 4. Poll the tracker until the round-trip is done.
  while (true) {
    const s = await tracker.trackRequest(chainId, requestId);

    if (s.execution) {
      ui.setStatus("failed", {
        reason: s.execution.errorMessage,
        code: s.execution.errorCode,
      });
      throw new Error(s.execution.errorMessage);
    }

    if (s.isTwoWay) {
      if (s.response?.execution) {
        ui.setStatus("failed", { reason: s.response.execution.errorMessage });
        throw new Error(s.response.execution.errorMessage);
      }
      if (s.response?.minedOnTarget) {
        ui.setStatus("completed");
        break;
      }
      ui.setStatus(s.minedOnTarget ? "executing-on-coti" : "pending");
    } else if (s.minedOnTarget) {
      ui.setStatus("completed");
      break;
    }

    await new Promise((r) => setTimeout(r, 3_000));
  }

  // 5. Read the ct* result stored by the callback and decrypt locally.
  const ct: string = await pod.contract.resultByRequest(requestId);
  const plain = CotiPodCrypto.decrypt(ct, aesKey, DataType.Bool);
  return plain === "true";
}
```

What the UI sees over time:

1. `submitting` – tx is being signed and broadcast on the source chain.
2. `pending` – request is in the inbox outbox on the source chain, waiting for
   the COTI miner to pick it up.
3. `executing-on-coti` – `minedOnTarget === true`, target contract has run;
   for two-way flows we're now waiting for the callback request to return.
4. `completed` – one-way: target executed cleanly. Two-way:
   `response.minedOnTarget === true`, the callback has executed on the source
   chain. The app-contract's `ct*` storage slot is ready to read.
5. `failed` – either `execution` on the outbound leg (encode / subcall failure)
   or `response.execution` on the return leg; surface
   `execution.errorMessage` to the user.

## Common patterns

- **Long-lived tracker, short-lived `PodContract`.** Instantiate `PodRequest`
  once per app; create a `PodContract` each time you bind to a different app
  contract or signer.
- **Correlate with on-chain storage.** Persist `requestId` alongside any
  user-facing entity; the tracker status alone is only the transport layer.
  The payload itself (the `ct*`) lives in your app contract, indexed by
  `requestId`.
- **Single-chain visibility is OK.** If your config only lists the source
  chain, `PodRequest` still reports `timestamp`, gas limits, and whether the
  request exists on the source inbox. `minedOnTarget` stays `false` and
  `execution` stays `null` because it can't see the target chain — useful in
  read-only dashboards.
- **Polling cadence.** 2–5 second intervals cover every realistic flow. Cap
  total polling time (e.g. 10 minutes) and surface a manual "re-check" button
  after a timeout rather than polling forever.

## Related docs

- [TypeScript integration (UX development)](06-typescript-integration-ux-development.md)
  – end-to-end responsibilities split.
- [Encrypt / decrypt](06b-encrypt-decrypt.md) – full `CotiPodCrypto` reference.
- [Async execution](05a-async-execution.md) – on-chain request state machine
  that `PodRequest` observes.
- [Fees, gas, and oracle](contracts/04-fees-gas-and-oracle.md) – what goes
  into `feeCfg`.
