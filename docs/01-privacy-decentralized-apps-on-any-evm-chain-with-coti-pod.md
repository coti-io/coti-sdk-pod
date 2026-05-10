# Privacy Decentralized Apps on any EVM chain with COTI Privacy on Demand (PoD)

## What this means in practice

With PoD, a privacy dApp keeps public orchestration on EVM while private computation runs on COTI.

- User submits encrypted inputs (`it*`) from client.
- EVM contract sends request through Inbox.
- COTI side computes on private compute-domain values (`gt*`).
- EVM callback receives encrypted outputs (`ct*`).
- User decrypts `ct*` locally with account AES key.

## Important constraint behind “any EVM chain”

You can integrate from any EVM chain **only if** that chain has the required Inbox deployment and configured cross-chain route to the target COTI execution environment.

Without Inbox connectivity, requests cannot reach COTI and callbacks cannot return.

## Domain model

1. Client domain:
   Builds signed encrypted input payloads and decrypts result ciphertext.
2. EVM domain:
   Owns app state machine and async request lifecycle.
3. COTI domain:
   Executes private logic and returns encrypted response payloads.

```mermaid
sequenceDiagram
    participant U as "User (Wallet/UI)"
    participant E as "EVM Contract"
    participant I as "Inbox"
    participant C as "COTI Executor/Contract"

    U->>U: Build it* payload (ciphertext + signature)
    U->>E: Submit tx with it* args
    E->>I: sendTwoWayMessage(...)
    I->>C: Forward request
    C->>C: Private compute on gt*
    C->>I: respond(abi.encode(ct*))
    I->>E: callback(bytes data)
    E->>E: decode ct* + persist by requestId
    U->>E: read ct*
    U->>U: decrypt ct* with account AES key
```

## Why this architecture is used

- Sensitive data does not need to be stored in plaintext on EVM.
- EVM contracts still control business workflow and composability.
- Async request IDs provide traceability for private operations.

## What this SDK provides

- Inbox contracts/interfaces for request-response flow.
- `PodLib` helpers for common private operations (e.g. `add64`, `gt64`, and width-specific variants).
- Optional **network preset mixins** (e.g. `PodUserSepolia`) with inbox / COTI chain / executor constants; combine with `PodLib` as `contract App is PodLib, PodUserSepolia` and wire them in the constructor (see `/docs/04-getting-started.md`).
- `MpcAbiCodec` argument typing and payload re-encoding logic.
- `MpcCore` type declarations and conversion operations.
- `CotiPodCrypto` TypeScript helper for encrypt/decrypt UX.

## What your team still must build

- App-specific EVM contracts.
- Optional COTI-side custom execution contracts for unsupported operations.
- Key onboarding and secure key storage UX.
- Indexing/monitoring for async request completion and failure handling.
