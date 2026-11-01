# SigLIP2 corpus policy for AM-Stage

SigLIP2 runs locally on CPU with the configured local SigLIP2 model. It does not use a GPU or Ollama. Index builds, cancellation, progress and logs are controlled only from AM-Core Engine → Service Bay.

The corpus includes parameters with one of the nine acoustic `domain_layer` values, including rows whose legacy retrieval scope is not sound/structure. Rows without `domain_layer` use the existing sound/structure eligibility rule. Pure UI, dashboard, monitoring and metrics namespaces are excluded. `GLOBAL_CONSENSUS_LAYER` is a future retrieval-time pass and is never stored as a SigLIP2 shard.

The TypeScript stale-check fingerprint follows `python_engine/v3_snapshot.py` byte-for-byte: frozen dataset bytes, a NUL separator, then library bytes. This prevents a valid index from being marked stale merely because the two runtimes fingerprinted different inputs.
