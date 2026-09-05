# Foundry Design System

## Direction

Industrial Minimalist: dark, structural, precise, and intentionally quiet. The
interface uses graphite surfaces, section-wide dividers, a copper-orange accent,
and repeatable tool-directory modules. The workshop character comes from the
system and typography rather than literal foundry imagery. It must never be
specialized to a fixed number of tools.

## Tokens

- Background: `#0B0E11`
- Surface: `#11161B`
- Text: `#F2F0EB`
- Secondary text: `#C5C7C7`
- Accent/primary: `#FF7A1A`
- Grid: `rgba(226, 229, 229, 0.13)`
- Grid strong: `rgba(226, 229, 229, 0.28)`
- Success: `#69C486`
- Warning: `#D6A546`
- Error: `#FF746C`
- Radius: `6px` to `10px`
- Border: `1px`
- Shadow/elevation: none

## Typography

- Display: Space Grotesk, 600–700, tight tracking, `0.9–1.0` line-height.
- Body: General Sans when licensed font files are supplied; the checked-in build
  uses the metrically similar self-hosted Public Sans, 400–600, `1.5–1.65`
  line-height.
- Controls and metadata: Public Sans, 500–650, sentence case by default.
- Wordmark: Space Grotesk, 650, uppercase with `0.16–0.22em` tracking.
- Mobile form text and body copy never render below `16px`.

## Layout

- Fixed/sticky technical header with square mark, essential navigation, and live
  service status.
- Section-wide 1px dividers; no floating cards or giant rounded wrappers.
- Tool catalog uses `repeat(auto-fit, minmax(...))`; every tool entry uses the
  same component contract and no hard-coded spans.
- Search is always present. Category filters render only when the live catalog
  contains more than one category.
- Dedicated tool workspaces share a title band and responsive split shell.
- Breakpoints: 375, 768, 1024, and 1440px.

## Interaction and accessibility

- Minimum interactive target: 44×44px.
- Every form control has a persistent visible label.
- `:focus-visible` uses a 2px copper-orange outline with 2px offset.
- Async operations expose textual state, progress, and `aria-live` announcements.
- Color never carries status by itself.
- Motion is limited to 150–200ms opacity/color/transform transitions and respects
  `prefers-reduced-motion`.

## Concept references

- `concepts/tool-directory-desktop.png`
- `concepts/tool-directory-mobile.png`
- `concepts/qr-workspace.png`
- `concepts/download-job.png`
