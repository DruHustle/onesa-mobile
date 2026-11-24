# Onesa Mobile design system

Decision date: **5 November 2026**. Applies to the public website, customer workspace, staff workspace, and native mobile app. Each application implements its own components and tokens; this specification does not introduce shared runtime dependencies.

## Visual identity

Use the Onesa wordmark with three rising, slightly slanted signal bars. The mark is decorative when readable “Onesa Mobile” text accompanies it. The customer and staff experiences share the identity but use explicit audience labels; staff access must never be inferred from appearance.

| Token | Value | Use |
| --- | --- | --- |
| Forest | `#103C35` | Primary actions, brand, major text and dark headers |
| Mint | `#C7F5B5` | Brand accent, selected backgrounds and light focus on dark surfaces |
| Ink | `#143B34` | Body text |
| Muted | `#5C716A` | Secondary text on white or near-white surfaces |
| Paper | `#F8F9F5` | Page background |
| Surface | `#FFFFFF` | Data panels and forms |
| Line | `#DAE3DA` | Nonessential dividers |
| Control border | `#718A78` | Empty inputs, selectors and outlined controls; keep separate from passive dividers |
| Illustration caption | `#4B624B` | Small text on the pale acquisition illustration |
| Confirmed | `#006F53` on `#E9F7EF` | Successful, evidenced results |
| Pending | `#9A5D00` on `#FFF1D8` | Work awaiting action or verification |
| Error | `#A12134` on `#FFF0F1` | Failed operations with a recoverable next step |

Calculated sRGB contrast for these primary combinations is approximately 12.21:1 for forest/white, 5.22:1 for muted/white, 9.98:1 for forest/mint, 5.59:1 for confirmed/pale, 4.78:1 for pending/pale, and 6.82:1 for error/pale. These calculations cover the listed pairs only; they do not certify complete screens. Do not use a pale border as the sole means of identifying an input or focused control.

The control-border token measures approximately 3.74:1 on white, 3.54:1 on paper, and 3.27:1 on the pale connection panel (`#EDF1E8`). Illustration captions measure at least 5.38:1 against the current gradient stops. The mint keyboard-focus ring on forest measures 9.98:1. Use the mint ring for actions inside dark plan cards as well as dark headers. The mobile public-header account action uses forest text on mint; undefined color tokens must never fall back to white there.

These choices follow the contrast principles in [W3C's text-contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text-contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). A low-contrast passive divider is different from a boundary needed to identify an empty input. The numerical checks do not establish overall accessibility compliance.

## Typography and density

Use system UI fonts for fast loading. Avoid a font download dependency for account access.

| Role | Web target | Native target |
| --- | --- | --- |
| Page title | 24–32px in workspaces; larger responsive public hero | 26–30sp, with scaling enabled |
| Section title | 18–22px | 18–22sp |
| Body / form value | 16px; 14px minimum in compact operational rows | 15–16sp |
| Navigation / action / essential label | 14px minimum | 14sp minimum |
| Input / select / textarea | 16px | 16sp |
| Optional caption / eyebrow | 12px minimum | 12sp minimum |

Use a body line-height around 1.5. Allow longer strings to wrap. Avoid fixed text heights, ellipses on critical amounts/status, and disabling font scaling. Align amounts with tabular numbers and display currency explicitly. Unknown values use a short explanation rather than an invented zero.

Compactness comes from grouping related information, reducing repeated headings, and moving secondary explanation into accessible disclosure. It does not come from shrinking essential text.

## Layout

- Spacing scale: 4, 8, 12, 16, 24 and 32px. Use 12–16px inside operational panels and 12–16px between related sections.
- Forms and reading content have a comfortable maximum width. Desktop work queues use the available width; phones use one primary column.
- Summaries use one concise metrics band or a small two-column grid. Keep labels and values together, with no decorative empty area.
- Use approximately 10–12px panel corners and 8px controls. Reserve a larger radius and an expressive illustration for public acquisition content.
- Use minimum 44px touch controls, with visible hover, pressed, focus, busy and unavailable states. A larger hit region may surround a compact icon.
- Put the touch padding on the interactive element itself. For an FAQ, the entire summary row should activate the disclosure; padding on its parent does not enlarge its target. The 44px product target exceeds the 24px minimum/spacing rule in [WCAG 2.2 target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Use dark green focus on light surfaces and mint focus on forest surfaces. Never remove keyboard focus from actionable elements.
- Keep the selected section discoverable on phones. If navigation exceeds the available width, expose an explicit section selector or overflow control.
- Support 320px reflow, 200% text enlargement, landscape layouts and native safe areas. Essential tables can scroll within a labelled focusable region.
- Keep illustration captions in normal document flow. Allow header actions, page actions and pagination to wrap, and give grid children a zero minimum width where long labels would otherwise widen the page. Do not hide overflow to conceal a layout defect.

## Screen hierarchy

**Public website:** proposition, current availability, primary action, plan terms, eligibility, and support. The website may explain satellite connectivity, but it must not imply an agreement or service that has not been verified.

**Customer home:** account or line identity, last-confirmed service state, plan/allowance and expiry, recent payment state, then the next action. Put information age next to data that may lag. A return visit should not begin with a large marketing hero.

**Staff home:** exceptions requiring action, owner and age, compact metrics, provider or hardware blockers, and recent activity. Separate inventory completeness, test readiness and actual network measurements.

**Hardware record:** asset label, type, site, inventory status, approval/commissioning evidence and test history. Distinguish manually entered observations from authenticated telemetry. A completed form is never labelled “online” solely because it was saved.

## State language

| State | Appearance | Wording rule |
| --- | --- | --- |
| Concept / unverified | Neutral label and outline | State what remains unknown; do not imply approval |
| Pending | Amber label and explicit next step | Name the pending operation or responsible review |
| Recorded | Neutral confirmation | Confirms that data was saved, not that service works |
| Approved / succeeded | Green with text | Requires authoritative evidence or a completed local operation with its scope stated |
| Failed | Red with text and retry/remedy | Preserve existing entered data where possible |
| Unavailable | Neutral disabled action plus explanation | Do not show a spinner or imply that retry alone will unlock a missing integration |
| Demo | Persistent, concise environment label | Keep fictional values distinct from real account data |

Never use color alone. Keep the action, target and result understandable in an audit trail. A toast is supplemental; transaction state must also be visible in the page.

## Graphic assets

Use small original SVG or code-native icons for navigation and connection diagrams. Give meaningful graphics accessible descriptions; hide redundant decorative icons from assistive technology. Do not copy competitor assets or introduce large videos, animated coverage maps, or background downloads into routine account screens.

Motion should clarify a local transition and respect reduced-motion preferences. A signal animation must never stand in for measured radio connectivity.

## Acceptance evidence

The [graphics review](reviews/GRAPHICS_REVIEW.md) records the initial findings. The overall review/validation documents should link each correction to its source change and observed result. Native screenshots, actual device behavior, network measurements and live service acceptance must be reported separately from web builds and JavaScript exports.
