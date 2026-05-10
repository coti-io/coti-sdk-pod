# Onboarding account (Account AES key)

This page describes a practical flow for acquiring and handling the account AES key used to decrypt `ct*` outputs.

## Key format requirement

`@coti-io/coti-sdk-typescript` expects user key as a 16-byte AES key represented as **32 hex characters without `0x` prefix**.

## Trust model

- AES key recovery happens on trusted client side.
- Backend should only process encrypted shares.
- Plaintext AES key should not transit backend APIs.

## Typical flow

1. Client generates RSA key pair.
2. Client sends RSA public key to onboarding service.
3. Service returns two encrypted key shares.
4. Client decrypts and combines shares into account AES key.
5. Client stores key in secure local storage.

## Example implementation

```typescript
import { generateRSAKeyPair, recoverUserKey } from "@coti-io/coti-sdk-typescript";

type KeySharesResponse = {
  encryptedKeyShare0: string;
  encryptedKeyShare1: string;
};

async function onboardAccount(
  requestShares: (publicKey: Uint8Array) => Promise<KeySharesResponse>
): Promise<string> {
  const { publicKey, privateKey } = generateRSAKeyPair();
  const { encryptedKeyShare0, encryptedKeyShare1 } = await requestShares(publicKey);

  const accountAesKey = recoverUserKey(privateKey, encryptedKeyShare0, encryptedKeyShare1);

  // validate expected format before storing
  if (!/^[0-9a-fA-F]{32}$/.test(accountAesKey)) {
    throw new Error("invalid AES key format");
  }

  return accountAesKey;
}
```

## Storage recommendations

- Web: encrypted-at-rest storage strategy with strict origin/session controls.
- Mobile: OS keychain / secure enclave.
- Server-rendered apps: avoid persisting AES key on server.

## Operational guardrails

- Never log key shares or recovered key.
- Do not pass key in URL/query params.
- Enforce TLS and authenticated onboarding endpoints.
- Add account/device recovery and rotation policy.
