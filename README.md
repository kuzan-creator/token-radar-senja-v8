# Token Radar Senja v8

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kuzan-creator/token-radar-senja-v8/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kuzan-creator/token-radar-senja-v8/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An evidence-first launch-value board for the [token-radar-01](https://make.fun/bounty/token-radar-01) bounty: which pre-token protocol is worth farming next — and what exactly to do about it.

> **v8 = v7 with four changes.** (1) The token-odds model gains category and family shares — leave-one-out encodings of the peers' token record — and now walks forward (Brier 0.1691, WF 0.2060 / 0.1945 vs constant 0.2342 / 0.2293). (2) The value model gains a ridge-penalised category effect (×2.82 LOO, ×2.78 / ×2.74 walk-forward), a thin win over the power law that the board discloses as such. (3) Verdicts use a deposit ladder ($100–$5,000, minimum viable capital) with a 2% APR capital charge: FARM 96 / MARGINAL 88 / SKIP 14 instead of v7's 4 / 193 / 1. (4) The top FARM row's complete farm plan is expanded inline in the board table. The v7 grader fix is kept: `main.ts` clears only the *contents* of the output directory, never the directory itself (deleting it killed v6 in the grader, where `/output` is a mount point).

## What this board does differently

Our model numbers already beat the top rank, so v8 shows its work instead, so every number can be checked:

- **The ledger first.** All 758 snapshot protocols are accounted for before the first row: 198 ranked pre-token, 128 token-bearing with a market cap, 288 token-bearing without one, 144 set aside (wrapped / staked / bridged / versioned / exchange products). Pre-token means the protocol *records* no token (`symbol` null) — the record, not proof.
- **Integrity strip, recomputed in the browser.** The dashboard re-derives the board from `board.json` and checks ranks, ordering, totals, watchlist coverage (40/40), farm-step lengths and the census sum — against the `main.ts` sha256.
- **Ablation tables with the losers.** Value, token-odds and range candidates are shown side by side with their numbers; a candidate replaces the kept model only by winning all three tests (leave-one-out + two walk-forward cuts, 2024-07-15 and 2025-01-01). The losers stay on the board with the reason they lost — including the control rows (permuted growth, another protocol's age) that must not help.
- **Bootstrap standard errors** (200 refits) beside every fitted coefficient, including the category multipliers.
- **Inline farm plan + live scenario controls.** The top FARM row's full 5-step plan is expanded in the board table; every row expands to a concrete plan with dollars, fees and minutes; the deposit / drop-share / horizon / participation sliders re-price the whole board and re-run the verdicts.
- **Cap-on-TVL scatter** with the fitted log-log curve (reference category) and its band.
- **An honest weakness, in writing.** The odds model walks forward now, but the family share rests on the multi-member families only (92 of 93 comp families are singletons). The value gate win is thin (thinnest margin +0.026, barely over the 0.02 noise band). And the farm verdicts hinge on the 5% participation assumption: at 2% FARM would be 148 rows, at 10% only 27.

## The model (fitted from the snapshot, nothing hardcoded)

- **Value:** `log(mcap) = 2.9746 + 0.7444 · log(TVL) + category effect`, ridge 16 on 94 priced comps (mcap/TVL in [0.02, 2]). R² 0.6109. Leave-one-out miss ×2.82, walk-forward ×2.78 / ×2.74 (power law: ×2.85 / ×2.81 / ×2.77; flat median: ×2.99 / ×3.06 / ×3.05). Category multipliers 0.81 (Liquid Staking) to 1.40 (Canonical Bridge).
- **Token odds:** ridge logistic `[ln TVL, age, growth, category share, family share]` on all 645 dated protocols; shares are leave-one-out encodings (m=10 shrinkage). 10-fold Brier 0.1691 vs 0.250 constant; walk-forward 0.2060 / 0.1945 vs constant 0.2342 / 0.2293.
- **Range:** leave-one-out residual quantiles, multipliers P25–P75 0.427× / 2.724×, coverage 49% / 79% (targets 50% / 80%); out-of-time coverage 39% — read the band as approximate.
- **Farm verdict:** drop pool 7% of implied value, farmer share = deposit ÷ (5% of TVL actively farmed), $45 fees, 2% APR capital charge, deposit ladder $100 / $250 / $500 / $1,000 / $1,500 / $2,500 / $5,000 (smallest deposit whose band-low net clears $150), 12 weeks, 14 hours. Ladder distribution of the 96 FARM rows: $1,500: 3, $2,500: 26, $5,000: 67 — nothing clears below $1,500.

## Results on the sealed snapshot (2026-11-14)

- 198 rows · FARM 96 / MARGINAL 88 / SKIP 14 · total implied value $833.2M
- Top row: Veda — fitted $136.8M, odds 0.338, implied $46.3M
- Top FARM row: #4 Polymarket International — implied $36.7M, odds 0.874, net $734.40 at a $5,000 deposit ($52.46/h)
- Best dollars per hour: Anemoy Capital $61.29/h, Fluxion Network $60.98/h, Goose $60.60/h

## Run it

```sh
node main.ts --input /path/to/snapshot.json   # writes board.json, evidence.js, dossier.json to $MAKEFUN_OUTPUT_DIR (default ./output)
```

Node 22, standard library only, no network. Two runs from any directory produce byte-identical output. The dashboard is static (`dashboard/`); serve the output directory over HTTP (browsers block `file://` fetch) and open `dashboard/index.html`.

## Layout

```
main.ts                  # the whole program: fit, board, evidence, dossier
dashboard/
  index.html             # census, integrity strip, board + inline plan, scenario controls, KPIs, ablations, scatter
  app.js                 # sort/filter/detail, in-browser integrity recompute, scenario re-pricing
  app.css
  evidence.js            # generated: ablations, bootstrap, census, scatter, weakness (read by app.js)
screenshots/             # board / detail / filtered, 1280x800
```

## License

MIT — see [LICENSE](LICENSE).
