# Cash Ball RTP Lab

Browser-based testing panel for Cash Ball.

Open https://anatolybas.github.io/cash-ball-rtp-lab/

Cash Ball RTP Lab

Serve this directory with any static HTTP server; no build or dependencies required. GitHub Pages serves the repository root. Do not open through file:// because module workers need HTTP.
Local mode reuses DemoGame. Its probabilities are placeholders, NOT the server model. Seed makes runs reproducible. Initial balance is local-mode only. Local stakes: 1вЂ“100 FUN.
RGS mode uses ONLY wss://dev.skyline-api.net/wss. The owner confirmed rgs=test uses virtual funds. Confirm the checkbox only for such an account. The actual panel URL is used for authentication, with rgs=test and currency. The RGS must authorize this launch URL. Signed launch links must come from the operator; do not paste secrets here. There is no production endpoint setting.
RGS request pacing: await each response, then at least max(30, delay) milliseconds before the next request. Rate limits must be agreed with the RGS operator; 30 ms is a configurable floor, not a proven safe load. No concurrent sessions, no automatic retries. A timeout stops the run and leaves the in-flight result unknown; reconcile it on the server before another run. Existing active rounds block new tests.
Rounds, not individual step requests, are counted. Stake and actual settled payout are used for RTP. The test collects at the first available stop >= target, including dash overshoots. Crash multiplier means multiplier of the failed step. No future crash outcome is inferred after collection. Dash count follows the same decoded dash events as the game; protocol does not supply a separate authoritative activation counter.
Wallet mismatch count compares previous balance - stake + payout against reported balance. Some sandbox wallets stay fixed: ask the RGS operator whether this is expected. A partially completed round is excluded from statistics; its wallet movements may need reconciliation.
RTP confidence interval assumes independent rounds and constant stake, uses observed sample variance and a normal approximation. It is unreliable for rare high payouts or correlated/adaptive server results. No target RTP is assumed. Large payout threshold is configurable and is not a server-defined jackpot.
Up to 1,000,000 rows are stored as compact numeric arrays in a Worker; UI updates are throttled, charts sampled, table paginated. CSV contains EVERY completed round. Closing/reloading loses the in-memory run. Export before closing. The source label in CSV distinguishes local from RGS data.
