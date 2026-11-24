# Native brand artwork

`brand-mark.svg` is the editable source for the installed Onesa Mobile artwork. It uses the same three rising, slanted bars as the public website, mint `#C7F5B5` and forest `#103C35`. It contains original vector geometry and no fonts, linked files or competitor artwork.

From the mobile package directory:

```sh
npm ci
npm run assets:build
npm run prebuild
```

The pinned `sharp` development dependency renders the SVG into three deterministic 1024 × 1024 PNG files:

| File | Purpose |
| --- | --- |
| `icon.png` | Opaque square source for the iOS app icon and standard launcher artwork. |
| `adaptive-icon.png` | Transparent Android foreground; its three-bar glyph fits within the central adaptive-icon safe zone. Android provides the forest background and launcher mask. |
| `splash.png` | Transparent launch-screen artwork; Expo provides the matching forest background. |

Keep the adaptive-icon and splash background colors in `app.json` equal to the SVG's `data-background` value. `expo prebuild` regenerates the committed iOS asset catalog and Android density-specific resources. Do not manually repaint the generated PNG/WebP files or native resource copies.

Repeat generation with the same lockfile produces identical output. A successful asset build or Expo prebuild does not establish a native compilation, signing, launch-screen appearance on a device, or App Store/Play Store acceptance; those remain separate release checks.
