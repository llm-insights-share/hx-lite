# Skill: Frontend Page Layout

## Shell components (compose pages from these only)

- B2B admin: `src/layouts/AdminShell.tsx`, `AuthLayout.tsx`
- B2C portal: `src/layouts/PortalShell.tsx`, `MarketingLayout.tsx`

## Rules

- Page files only compose shells + sections/components; no fetch or business rules in `src/pages`.
- Cross-page logic lives in `src/hooks`; primitives in `src/components`.
- New pages must be listed in `design/ui/pages.md` with route and shell before apply.
- Use design tokens for spacing (`spacing.*`) — see `design-tokens` Skill.
