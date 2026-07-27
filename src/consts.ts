/**
 * Default PoD Inbox addresses by chain id.
 * Source: `pod-ecosystem-integration/deployConfig.json` `inboxSalt` (`pod.inbox.v2.2` CREATE3).
 */

/** Shared CREATE3 inbox on Sepolia, COTI testnet, and Avalanche Fuji. */
export const DEFAULT_INBOX_ADDRESS =
  "0x3b8B70819f27e0438cBcE7f31894f799da52648F" as const;

/** Sepolia (11155111) — EVM-side inbox. */
export const SEPOLIA_DEFAULT_INBOX_ADDRESS = DEFAULT_INBOX_ADDRESS;

/** COTI testnet (7082400) — COTI-side inbox. */
export const COTI_TESTNET_DEFAULT_INBOX_ADDRESS = DEFAULT_INBOX_ADDRESS;

/** Avalanche Fuji (43113) — EVM-side inbox. */
export const FUJI_DEFAULT_INBOX_ADDRESS = DEFAULT_INBOX_ADDRESS;

/**
 * `chainId` as decimal string → default inbox for fee estimation / log filtering.
 *
 * Testnet entries only — mainnet deployments require explicit `PodSdkConfig.chains`
 * or `PodContract` `inboxAddress` override.
 */
export const DEFAULT_INBOX_ADDRESS_BY_CHAIN_ID: Readonly<Record<string, string>> =
  Object.freeze({
    "11155111": SEPOLIA_DEFAULT_INBOX_ADDRESS,
    "43113": FUJI_DEFAULT_INBOX_ADDRESS,
    "7082400": COTI_TESTNET_DEFAULT_INBOX_ADDRESS,
  });
