/**
 * Default PoD Inbox addresses by chain id.
 * Sources: `contracts/mpc/PodUserSepolia.sol`, `contracts/InboxUserCotiTestnet.sol`
 */

/** Sepolia (11155111) — EVM-side inbox (`PodUserSepolia.INBOX_ADDRESS`). */
export const SEPOLIA_DEFAULT_INBOX_ADDRESS =
  "0xFa158f9e49C8bb77f971c3630EbCD23a8a88D14E" as const;

/** COTI testnet (7082400) — inbox (`InboxUserCotiTestnet.COTI_TESTNET_INBOX`). */
export const COTI_TESTNET_DEFAULT_INBOX_ADDRESS =
  "0x0f9A5cD00450Db1217839C35D23D56F96d6331AE" as const;

/** `chainId` as decimal string → default inbox for fee estimation / log filtering. */
export const DEFAULT_INBOX_ADDRESS_BY_CHAIN_ID: Readonly<Record<string, string>> =
  Object.freeze({
    "11155111": SEPOLIA_DEFAULT_INBOX_ADDRESS,
    "7082400": COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  });
