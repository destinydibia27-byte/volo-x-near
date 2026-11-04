import {
  bytesToHex,
  hexToBytes,
  keccak256,
  recoverAddress,
  serializeTransaction,
  type Address,
  type Hex,
  type TransactionSerializable,
} from "viem";
import { publicKeyToAddress, toAccount } from "viem/accounts";
import { constants, contracts, utils } from "chainsig.js";

/**
 * NEAR-derived executor (Volo x NEAR).
 *
 * Instead of holding a raw EVM private key (EXECUTOR_PRIVATE_KEY), the worker's Arbitrum address
 * is derived from a NEAR account through NEAR Chain Signatures, and every transaction is signed
 * by NEAR's MPC network. No EVM private key for the executor exists anywhere.
 *
 * Trust model, stated plainly: the worker still holds a NEAR access key that can ASK the MPC
 * network to sign. That key can be a NEAR function-call key limited to the MPC contract, and the
 * Volo contract's own caps, recipient lock and schedule still bound anything it could do.
 */

export type NearNetwork = "testnet" | "mainnet";

/** What the MPC network returns for one 32-byte digest. */
export interface DigestSignature {
  r: Hex;
  s: Hex;
  yParity: 0 | 1;
}
export type DigestSigner = (digest: Hex) => Promise<DigestSignature>;

export const DEFAULT_DERIVATION_PATH = "volo-executor-1";

/** Offline: the EVM address NEAR's MPC network controls for (nearAccountId, path). No network call. */
export function deriveExecutorAddress(
  nearAccountId: string,
  path: string = DEFAULT_DERIVATION_PATH,
  network: NearNetwork = "testnet"
): Address {
  const env = network === "mainnet" ? "MAINNET" : "TESTNET";
  const root = utils.cryptography.najToUncompressedPubKeySEC1(constants.ROOT_PUBLIC_KEYS[env].secp256k1);
  const child = utils.cryptography.deriveChildPublicKey(root, nearAccountId, path);
  return publicKeyToAddress(`0x${child}`);
}

/** A viem account whose signatures come from `signDigest`. Only transaction signing is supported. */
export function createNearViemAccount(opts: { address: Address; signDigest: DigestSigner }) {
  const { address, signDigest } = opts;
  const unsupported = (what: string) => async () => {
    throw new Error(`NEAR executor account does not support ${what}; it only signs transactions.`);
  };
  return toAccount({
    address,
    signMessage: unsupported("signMessage"),
    signTypedData: unsupported("signTypedData"),
    async signTransaction(transaction, options) {
      const serialize = (options?.serializer ?? serializeTransaction) as typeof serializeTransaction;
      const tx = (
        transaction.type === "eip4844" ? { ...transaction, sidecars: false } : transaction
      ) as TransactionSerializable;
      const digest = keccak256(serialize(tx));
      const sig = await signDigest(digest);
      // Never broadcast a transaction signed by the wrong key: recover and compare first.
      const recovered = await recoverAddress({
        hash: digest,
        signature: { r: sig.r, s: sig.s, yParity: sig.yParity },
      });
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `MPC signature recovers to ${recovered}, expected ${address}. Check NEAR_ACCOUNT_ID and NEAR_DERIVATION_PATH.`
        );
      }
      return serialize(tx, { r: sig.r, s: sig.s, yParity: sig.yParity });
    },
  });
}

/** Turns chainsig.js's RSV signature (r, s without 0x; v = recovery_id + 27) into a DigestSignature. */
export function rsvToDigestSignature(rsv: { r: string; s: string; v: number }): DigestSignature {
  const yParity = rsv.v - 27;
  if (yParity !== 0 && yParity !== 1) throw new Error(`Unexpected recovery value v=${rsv.v} from MPC signer.`);
  const pad = (h: string) => `0x${h.replace(/^0x/, "").padStart(64, "0")}` as Hex;
  return { r: pad(rsv.r), s: pad(rsv.s), yParity };
}

/** Real signer: asks the NEAR MPC contract to sign. Needs a NEAR account with a little NEAR for fees. */
export function createMpcDigestSigner(opts: {
  nearAccountId: string;
  nearSecretKey: string; // "ed25519:..."
  network?: NearNetwork;
  path?: string;
  rpcUrl?: string;
}): DigestSigner {
  const network = opts.network ?? "testnet";
  const path = opts.path ?? DEFAULT_DERIVATION_PATH;
  const rpcUrl = opts.rpcUrl ?? `https://rpc.${network}.near.org`;
  const contract = new contracts.ChainSignatureContract({ networkId: network });

  // Loaded lazily so tests and key-mode workers never pull in the NEAR client libraries.
  let account: Promise<any> | undefined;
  const getAccount = () =>
    (account ??= (async () => {
      const [{ Account }, { KeyPairSigner }, { JsonRpcProvider }] = await Promise.all([
        import("@near-js/accounts"),
        import("@near-js/signers"),
        import("@near-js/providers"),
      ]);
      const signer = KeyPairSigner.fromSecretKey(opts.nearSecretKey as any);
      return new Account(opts.nearAccountId, new JsonRpcProvider({ url: rpcUrl }), signer);
    })());

  const signerAccount = {
    accountId: opts.nearAccountId,
    async signAndSendTransactions({ transactions }: { transactions: any[] }) {
      const acc = await getAccount();
      const outcomes = [];
      for (const t of transactions) {
        outcomes.push(await acc.signAndSendTransaction({ receiverId: t.receiverId, actions: t.actions }));
      }
      return outcomes;
    },
  };

  return async (digest) => {
    const [rsv] = await contract.sign({
      payloads: [Array.from(hexToBytes(digest))],
      path,
      keyType: "Ecdsa",
      signerAccount: signerAccount as any,
    });
    return rsvToDigestSignature(rsv);
  };
}

export { bytesToHex };
