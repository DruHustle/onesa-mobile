# Shared blue-green theme

Pasofi and Onesa Mobile use the same blue-green palette while retaining their
own navigation, product behavior and readiness labels. This is visual alignment;
it does not integrate their accounts, payments, APIs or runtime packages.

| Role | Color |
| --- | --- |
| Primary action | Blue `#075CF5` with white text |
| Primary hover | Darker blue `#0647C7` |
| Brand surface and heading | Deep teal `#103C35` |
| Strong green accent | Green `#006F53` |
| Soft accent | Mint `#C7F5B5` with dark teal text |
| Main background | Paper `#F8F9F5` |
| Body text | Ink `#143B34` |
| Secondary text | Muted `#5C716A` |
| Borders | `#DAE3DA`; control borders `#718A78` |
| Light supporting surfaces | Blue `#EAF2FF` or green `#E9F7EF` |

Use blue for ordinary primary actions and deep teal/green for branded surfaces
and supporting accents. Mint actions on dark branded panels are an intentional
contrast variant. Keep warning/error colors and meanings distinct. Do not use
purple or neon lime as unrelated brand accents.

The palette is repeated within independently buildable packages; there is no
cross-repository runtime import. Typography, spacing, responsive breakpoints,
control dimensions and information architecture remain product-specific.
Both current products retain their existing light-theme behavior.

Changing colors must not change live/demo boundaries, payment capabilities,
authentication, navigation, consent or product-readiness statements. Source
checks and web previews do not establish native device or store qualification.

## Onesa Mobile implementation

Web public, customer-workspace and internal-operation primary buttons use the
shared blue; their existing teal headers and mint accents remain. The native
palette and button styles live in `onesa-mobile-frontend/mobile/src/ui.tsx`.
Native pressed opacity stays high enough to preserve white-on-blue readability;
disabled behavior and accessibility state remain unchanged. No generated native
project, signing configuration or product capability is changed by the theme.
