# Contributing

Thanks for taking an interest in PLAYER.

## Development Setup

```sh
pnpm install
pnpm dev
```

Run checks before opening a pull request:

```sh
pnpm lint
pnpm test
pnpm build
```

## Guidelines

- Keep Strudel code as the source of truth. Visual edits should write deterministic changes back to
  the editor text.
- Prefer conservative parsers and explicit fallback behavior over best-effort mutation.
- Add or update tests when changing notation parsing, timeline analysis, arrangement recognition, or
  persistence behavior.
- Keep UI changes consistent with the existing editor-focused interface.
- Do not commit generated build output, local environment files, or browser storage exports unless they
  are intentional fixtures.

## License

By contributing, you agree that your contribution is licensed under the same license as the project:
AGPL-3.0-or-later.
