# Aaron Toolkit Design System

## Direction

Technical Minimalist: flat, structural, precise, and intentionally quiet. The
interface uses a paper canvas, section-wide dividers, a faint mosaic grid, and
repeatable tool-directory modules. It must never be specialized to exactly two
tools.

## Tokens

- Paper/background: `#F7F7F5`
- Surface: `#FFFFFF`
- Forest/text/primary: `#1A3C2B`
- Grid: `rgba(58, 58, 56, 0.20)`
- Grid strong: `rgba(58, 58, 56, 0.42)`
- Coral/media: `#FF6948`
- Mint/generate/success: `#3BCB75`
- Gold/warning: `#C79600`
- Error: `#B42318`
- Radius: `0` or `2px`
- Border: `1px`
- Shadow/elevation: none

## Typography

- Display: Space Grotesk, 600–700, tight tracking, `0.9–1.0` line-height.
- Body: General Sans when licensed font files are supplied; the checked-in build
  uses the metrically similar self-hosted Public Sans, 400–600, `1.5–1.65`
  line-height.
- Controls and metadata: JetBrains Mono, 500–600, uppercase where appropriate,
  `0.08–0.12em` tracking.
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
- `:focus-visible` uses a 2px Forest outline with 2px offset.
- Async operations expose textual state, progress, and `aria-live` announcements.
- Color never carries status by itself.
- Motion is limited to 150–200ms opacity/color/transform transitions and respects
  `prefers-reduced-motion`.

## Concept references

- `concepts/tool-directory-desktop.png`
- `concepts/tool-directory-mobile.png`
- `concepts/qr-workspace.png`
- `concepts/download-job.png`
