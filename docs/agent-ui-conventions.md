# Agent UI conventions

- Add or change visible copy in both English and Russian in `src/lib/ui-copy.ts`; German may fall back to English.
- Give interactive controls and dense metrics a concise tooltip or `title`.
- Pair every long-running start, build, rebuild, or audit action with a stop control when the operation can be cancelled.
- Prefer the existing shadcn-based UI primitives for new settings and panels.
- Keep index rebuild entry points in Service Bay. Other modes link to `/service-bay` and may show cached status.
- Do not introduce user-facing “V3” or language suggesting a frozen parameter catalogue. Legacy `v3` paths may remain internal.
- Model loading is explicit and on demand. Runtime endpoints must enforce the persisted capability registry.
