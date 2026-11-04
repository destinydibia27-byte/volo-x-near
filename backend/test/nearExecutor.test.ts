import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTransaction, hexToBytes, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, sign } from "viem/accounts";
import { recoverTransactionAddress } from "viem";
import {
  createNearViemAccount,
  deriveExecutorAddress,
  rsvToDigestSignature,
  type DigestSigner,
} from "../src/nearExecutor";

/** A local key standing in for the MPC network, so the integration logic is testable offline. */
function fakeMpc(privateKey: Hex): { signer: DigestSigner; address: `0x${string}` } {
  const acct = privateKeyToAccount(privateKey);
  const signer: DigestSigner = async (digest) => {
    const sig = await sign({ hash: digest, privateKey });
    return { r: sig.r, s: sig.s, yParity: (sig.yParity ?? (Number(sig.v) - 27)) as 0 | 1 };
  };
  return { signer, address: acct.address };
}

const tx = {
  type: "eip1559" as const,
  chainId: 421614,
  nonce: 7,
  to: "0x000000000000000000000000000000000000dEaD" as const,
  value: 0n,
  data: "0x1234" as Hex,
  gas: 100_000n,
  maxFeePerGas: 1_000_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
};

test("derivation is deterministic and depends on account, path and network", () => {
  const a = deriveExecutorAddress("volo.testnet", "volo-executor-1", "testnet");
  assert.match(a, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(a, deriveExecutorAddress("volo.testnet", "volo-executor-1", "testnet"));
  assert.notEqual(a, deriveExecutorAddress("volo.testnet", "volo-executor-2", "testnet"));
  assert.notEqual(a, deriveExecutorAddress("other.testnet", "volo-executor-1", "testnet"));
  assert.notEqual(a, deriveExecutorAddress("volo.testnet", "volo-executor-1", "mainnet"));
});

test("signed transaction recovers to the executor address", async () => {
  const { signer, address } = fakeMpc(generatePrivateKey());
  const account = createNearViemAccount({ address, signDigest: signer });
  const serialized = await account.signTransaction(tx);
  const parsed = parseTransaction(serialized);
  assert.equal(parsed.nonce, 7);
  assert.equal(parsed.chainId, 421614);
  assert.equal(
    (await recoverTransactionAddress({ serializedTransaction: serialized as `0x02${string}` })).toLowerCase(),
    address.toLowerCase()
  );
});

test("refuses to return a transaction signed by the wrong key", async () => {
  const { signer } = fakeMpc(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey()).address;
  const account = createNearViemAccount({ address: other, signDigest: signer });
  await assert.rejects(() => account.signTransaction(tx), /recovers to/);
});

test("message and typed-data signing are not supported", async () => {
  const { signer, address } = fakeMpc(generatePrivateKey());
  const account = createNearViemAccount({ address, signDigest: signer });
  await assert.rejects(() => account.signMessage({ message: "hi" }), /does not support signMessage/);
});

test("rsvToDigestSignature maps chainsig.js output (v = recovery_id + 27)", () => {
  const r = "ab".repeat(32);
  const s = "cd".repeat(32);
  assert.deepEqual(rsvToDigestSignature({ r, s, v: 27 }), { r: `0x${r}`, s: `0x${s}`, yParity: 0 });
  assert.equal(rsvToDigestSignature({ r, s, v: 28 }).yParity, 1);
  assert.throws(() => rsvToDigestSignature({ r, s, v: 5 }), /Unexpected recovery value/);
  // short values get left-padded to 32 bytes
  assert.equal(hexToBytes(rsvToDigestSignature({ r: "01", s: "02", v: 27 }).r).length, 32);
});

test("chain.ts picks the NEAR-derived address when EXECUTOR_MODE=near (and no EVM key is needed)", async () => {
  const saved = { ...process.env };
  try {
    delete process.env.EXECUTOR_PRIVATE_KEY;
    process.env.EXECUTOR_MODE = "near";
    process.env.NEAR_ACCOUNT_ID = "volo.testnet";
    process.env.NEAR_NETWORK = "testnet";
    delete process.env.NEAR_DERIVATION_PATH;
    const { executorAccountAddress, executorMode } = await import("../src/chain");
    assert.equal(executorMode(), "near");
    assert.equal(executorAccountAddress(), deriveExecutorAddress("volo.testnet", "volo-executor-1", "testnet"));
    process.env.EXECUTOR_MODE = "key";
    process.env.EXECUTOR_PRIVATE_KEY = "0x" + "11".repeat(32);
    assert.equal(executorMode(), "key");
    assert.equal(executorAccountAddress(), privateKeyToAccount(("0x" + "11".repeat(32)) as Hex).address);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
