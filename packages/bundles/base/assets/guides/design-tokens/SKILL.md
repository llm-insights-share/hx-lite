# Skill: Design Tokens

## Source of truth

- Shared tokens: `packages/design-tokens/` or `src/shared/tokens/`
- CSS variables: `var(--color-*)`, `var(--spacing-*)`

## Rules

- No hardcoded hex colors or magic pixel spacing in components.
- New tokens for a change must be listed in `design/overview.md` ## Design Tokens table.
- Map Figma variables to token names in `docs/design/token-mapping.md` when applicable.
