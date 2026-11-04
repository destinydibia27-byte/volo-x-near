/**
 * Prints the Arbitrum address that NEAR's MPC network controls for your NEAR account, and what
 * to do with it. Offline: no network call, no keys.
 *
 *   NEAR_ACCOUNT_ID=you.testnet npm run near-executor
 */
import { DEFAULT_DERIVATION_PATH, deriveExecutorAddress, type NearNetwork } from "../src/nearExecutor";

const account = process.env.NEAR_ACCOUNT_ID;
if (!account) {
  console.error("Set NEAR_ACCOUNT_ID (e.g. you.testnet).");
  process.exit(1);
}
const network = (process.env.NEAR_NETWORK || "testnet") as NearNetwork;
const path = process.env.NEAR_DERIVATION_PATH || DEFAULT_DERIVATION_PATH;
const address = deriveExecutorAddress(account, path, network);

console.log(`NEAR account : ${account} (${network})`);
console.log(`Path         : ${path}`);
console.log(`Executor addr: ${address}\n`);
console.log("1. Send this address a little Arbitrum Sepolia ETH for gas (free faucet).");
console.log("2. As the contract OWNER, point the contract at it:");
console.log(`     cast send $PULSE_CONTRACT_ADDRESS "setExecutor(address)" ${address} --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $OWNER_KEY`);
console.log("3. In backend/.env set EXECUTOR_MODE=near, NEAR_ACCOUNT_ID, NEAR_PRIVATE_KEY; remove EXECUTOR_PRIVATE_KEY.");
console.log("4. npm run worker. Startup refuses to run if the contract's executor doesn't match this address.");
