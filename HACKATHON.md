# Volo x NEAR: what was built during the hackathon

Volo (Arbitrum onchain automation with a contract-enforced rule layer) existed before
1 Nov 2026. This file lists only the work added from 1 Nov 2026 onward. Every change is a commit
on the `near-hackathon` branch.

## Before the hackathon (baseline)
- Plain-English rule parser with grounding checks
- `PulseAutomation.sol` contract (locked recipient, caps, weekday, once per day, balance condition)
- Worker, Next.js app, ZeroDev smart-account code, Supabase storage
- 182 backend tests

## Added during the hackathon

### NEAR-derived executor (NEAR Chain Signatures)
Before: the worker held `EXECUTOR_PRIVATE_KEY`, a raw EVM key. The README listed this as a known limit.

Now (`EXECUTOR_MODE=near`): the executor's Arbitrum address is derived from a NEAR account, and every
`execute()` transaction is signed by NEAR's MPC network. No EVM private key for the executor exists.

- `backend/src/nearExecutor.ts`: offline address derivation, a viem account backed by the MPC signer,
  and a guard that recovers the signer from each signature and refuses to return a transaction signed
  by the wrong key.
- `backend/src/chain.ts`: `EXECUTOR_MODE` switch (`key` stays the default, so nothing existing changes).
- `backend/src/triggerWorker.ts`: startup check now explains the mismatch and the `setExecutor` fix.
- `backend/scripts/near-executor.ts` (`npm run near-executor`): prints the derived address and the steps.
- `backend/test/nearExecutor.test.ts`: 6 new tests (188 total pass).
- No contract change: `PulseAutomation.setExecutor` already existed (owner only).

**Trust model, stated plainly.** The worker still holds a NEAR access key that can ask the MPC network to
sign. Use a function-call key limited to the MPC contract. The Volo contract's caps, locked recipient and
schedule still bound anything the executor can do. This removes a raw key; it is not a TEE.

### What is verified and what is not
- Verified here: address derivation, transaction serialization/signing, signer-recovery guard, mode
  switching, all against a local stand-in for the MPC network.
- **Not verified here: a live signature from `v1.signer-prod.testnet`.** The build sandbox cannot reach NEAR
  RPC. The live path is the next section; run it before relying on it.

### Run it on testnet (all free)
1. Create a NEAR testnet account and fund it from a faucet.
2. `cd backend && NEAR_ACCOUNT_ID=you.testnet npm run near-executor` and copy the address.
3. Send that address Arbitrum Sepolia ETH for gas.
4. As contract owner: `setExecutor(<address>)`.
5. Set `EXECUTOR_MODE=near`, `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY` in `backend/.env`; remove `EXECUTOR_PRIVATE_KEY`.
6. `npm run worker`.

### Dependency note
`@noble/curves` is pinned to 1.9.3 in `backend/package.json` (`overrides`); chainsig.js needs a subpath
that 1.9.1 lacks.

## Not built (honest scope)
- NEAR Intents settlement. Intents' bridge works with real chains (Arbitrum One), while Volo runs on
  Arbitrum Sepolia, so a payout would not reach an Intents balance. A read-only "preview" (quote and
  deposit address, no funds moved) is the planned free addition.
- TEE-hosted worker (Shade Agent).

## Tracks
Autonomous Business, AI Security & Defense, Real-World Money
