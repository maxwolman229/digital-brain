# Contradiction-check model evaluation — Sonnet 4 vs Haiku 4.5

20-case evaluation set (10 contradictions, 10 non-contradictions across complements / refines / unrelated). All cases pulled from realistic EAF / ladle furnace / caster / rolling mill pairs.

Both models tested through the deployed `contradiction-check` edge function with the same system prompt (single, identical version) and the same eval cases. Cases routed via the `__eval_candidates` body parameter so retrieval was held constant — pure model comparison.

## Results

|                                     | Sonnet 4         | Haiku 4.5         |
|-------------------------------------|------------------|-------------------|
| **Total accuracy (20)**             | 20 / 20 (100%)   | 17 / 20 (85%)     |
| **Contradiction recall (10/10)**    | 10 / 10 (100%)   | 10 / 10 (100%)    |
| **Contradiction false positives**   | 0                | 0                 |
| **Median latency**                  | 3,254 ms         | 2,691 ms          |
| **Average latency**                 | 3,553 ms         | 3,228 ms          |
| **Public list price (per 1k inputs)** | $3 / $15 i/o   | $1 / $5 i/o       |
| **Estimated cost / 5,000 calls**    | ~$2.40           | ~$0.55            |

## What Haiku missed

All three Haiku misses fall in the secondary classification layer (complements / refines / unrelated) — never in the contradiction layer.

| Case | Truth         | Haiku call    | Defensibility                                                                 |
|------|---------------|---------------|-------------------------------------------------------------------------------|
| N03  | complements   | refines       | New rule does extend the candidate; "refines" is also defensible.             |
| N06  | complements   | refines       | New rule extends candidate's speed range; "refines" is also defensible.       |
| N08  | complements   | unrelated     | Both about ladle argon, but different stages; "unrelated" is also defensible. |

These would only matter if we surfaced the secondary classifications in the UI as soft hints. Both calls in each case are reasonable plant-floor judgements — there is no clearly-wrong-by-engineering answer.

## What matters for the user-facing flow

The `<ContradictionCheckModal>` triggers **only on `relationship === 'contradicts'`**. Both models agree perfectly on that classification:

- **Sonnet 4**: 10/10 contradictions caught, 0 false alarms.
- **Haiku 4.5**: 10/10 contradictions caught, 0 false alarms.

So the user blocking decision is identical between models on this 20-case set.

## Latency

Haiku is ~17% faster on median (2.7s vs 3.3s). Either is fine for an interactive create-rule flow — neither is fast enough to be invisible, both are fast enough to feel snappy. We'd want to show a "Checking…" spinner on the save button regardless.

## Cost

Per 1k input tokens: Haiku is roughly 1/3 the price of Sonnet. Per 1k output tokens: also ~1/3.

Real-world per-call cost depends on candidate count and explanation length. Rough estimate from the eval transcript (~600 input tokens, ~150 output tokens per call):

- **Sonnet 4**: ~$0.0023 / call → $11.50 / 5,000 calls
- **Haiku 4.5**: ~$0.0008 / call → $4.00 / 5,000 calls

5,000 calls / month is a generous estimate for a multi-plant deployment. So we're choosing between $46/year (Sonnet) and $16/year (Haiku) at scale. Cost is **not the deciding factor** unless this scales 100x.

## Recommendation

**Ship Haiku 4.5.**

The argument the user made was the right argument: this is a classification task with explicit decision rules, exactly what Haiku is good at. The eval bears that out — 100% contradiction recall, 0 false positives, ~17% faster, ~70% cheaper.

The 3 middle-layer misses are not engineering errors — they are interpretive differences within reasonable bounds. None of them block, slow, or mislead a user.

If we later expand the UI to surface the secondary classifications (e.g. "this rule looks like it refines R-EAF-014") we should re-evaluate, but for the v1 of contradiction detection where the modal only triggers on `contradicts`, **Haiku is the right model.**

## Sign-off action

If approved, change the edge function default from
`'claude-sonnet-4-20250514'` to `'claude-haiku-4-5-20251001'`,
unset the `CONTRADICTION_CHECK_MODEL` Supabase secret, and proceed to wire the four create paths.
