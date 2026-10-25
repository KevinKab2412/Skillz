# Performance benchmarks

## Suitable claims

Named workloads meet approved latency, throughput, or resource budgets, or improve against a
specified baseline without unacceptable regressions.

## Prerequisites

A representative workload and data scale, fixed environment, baseline build, warmup policy, sample
count, concurrency, and resource monitoring. Separate microbenchmarks from end-to-end service load.
Use isolated tooling within existing permissions. Load tests must target an explicitly permitted
local/test environment and must not call paid/external services without authorization.

## Independent reference and passing criteria

Source budgets from approved SLOs or measured baseline requirements. Record units, measurement
boundary, distribution/percentiles, repetition and variability, error rate, and exclusions. Do not
choose thresholds after seeing candidate results. Passing requires the agreed statistic and error
budget to meet the threshold on every required workload; distinguish inconclusive/noisy results.

## Execution recipe — illustrative microbenchmark

Assumes `pytest-benchmark` is already installed and the generic renderer has an independent expected
output. The example captures measurements; it supplies no invented performance acceptance threshold.

```python
from example_app.render import render

def test_small_render_benchmark(benchmark):
    output = benchmark(render, {'title': 'Example'})
    assert output == '<h1>Example</h1>'
```

```sh
python -m pytest tests/perf/test_render.py --benchmark-only --benchmark-json=benchmark.json
```

Save baseline/candidate outputs separately. Apply the repository's pre-agreed comparison or guard
to those results. A successful measurement command alone does not mean the budget passed. Use the
existing service load runner for realistic request/concurrency and tail-latency claims.

## Known-bad check

Introduce an isolated, deterministic slowdown large enough to exceed the approved budget. Confirm
the budget guard fails, not merely that the measurement increases. Restore and rerun. If no guard
exists, report that gap rather than claiming the benchmark enforces a budget.

## Blind spots

Microbenchmarks omit network/storage behavior. Warm caches, shared-host noise, unrealistic data,
coordinated omission, and errors excluded from measurements can distort results. Percentiles from
too few samples are weak evidence; one fast run does not establish capacity.

## Official documentation

- [pytest-benchmark usage](https://pytest-benchmark.readthedocs.io/en/latest/usage.html)
- [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/)

Match installed versions and tooling. Example illustrative and unexecuted.
