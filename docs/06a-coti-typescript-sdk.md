# coti-typescript-sdk

Package: `@coti-io/coti-sdk-typescript`

This package provides low-level cryptography and typed input helpers used with PoD contracts.

## APIs commonly used with this SDK

| API | Purpose |
|---|---|
| `buildInputText` | Build signed encrypted numeric input payload |
| `buildStringInputText` | Build signed encrypted string input payload |
| `decryptUint` | Decrypt numeric ciphertext with account AES key |
| `decryptString` | Decrypt string ciphertext with account AES key |
| `generateRSAKeyPair` | Generate onboarding RSA keys |
| `recoverUserKey` | Reconstruct account AES key from encrypted shares |

## Safer selector handling

Do not hardcode selectors if avoidable. Build from ABI:

```typescript
import { Interface, Wallet } from "ethers";
import { buildInputText } from "@coti-io/coti-sdk-typescript";

const iface = new Interface(["function compare((uint256,bytes),(uint256,bytes))"]);
const selector = iface.getFunction("compare")!.selector;

const sender = {
  wallet: new Wallet(process.env.PRIVATE_KEY!),
  userKey: accountAesKey,
};

const itValue = buildInputText(42n, sender, contractAddress, selector);
```

## String input example

```typescript
import { buildStringInputText } from "@coti-io/coti-sdk-typescript";

const itMemo = buildStringInputText("private memo", sender, contractAddress, selector);
```

## Decryption example

```typescript
import { decryptUint, decryptString } from "@coti-io/coti-sdk-typescript";

const amount = decryptUint(BigInt(ctAmountHex), accountAesKey);
const note = decryptString({ value: ctStringCells }, accountAesKey);
```

## Correctness notes

- `contractAddress` and `selector` used in signed input must match the actual on-chain call target.
- Use the same account AES key used for that user context.
- For string decrypt, pass bigint-compatible cell values.
