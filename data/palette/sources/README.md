# Palette source data

Fetched 2026-10-21. The generator in `tools/build-palette-data.mjs` reads only these checked-in files.

| Collection | Upstream URL | Revision | Licence | Used by generator |
|---|---|---|---|---|
| Wada / Dictionary of Colour Combinations | https://github.com/mattdesl/dictionary-of-colour-combinations | c142bd0bc804 | MIT, Matt DesLauriers | `wada/colors.json`: all 2, 3, and 4 colour combinations and their colour names |
| MetBrewer | https://github.com/BlakeRMills/MetBrewer | 58839e5ac7c7 | CC0 1.0, Blake Robert Mills | `metbrewer/PaletteCode.R`: `MetPalettes` colour vectors and discrete ordering vectors |
| Wes Anderson palettes | https://github.com/karthik/wesanderson | 02e4129c185e | MIT, Karthik Ram | `wesanderson/colors.R`: unique base vectors in `wes_palettes`, excluding aliases |
| ColourLovers via nice-color-palettes | https://github.com/Jam3/nice-color-palettes | revision not listed in `SOURCES-REVISIONS.txt` | MIT, see included licence | `colourlovers/nice-color-palettes-1000.json` |
| Color Hunt | https://github.com/twopirllc/paletteer (local upstream bundle) | revision not listed in `SOURCES-REVISIONS.txt` | See source repository | `colorhunt/*.json`: all, retro, and vintage pages; duplicate codes are merged |

The original licence files are kept beside each source. Revision identifiers are the upstream commit prefixes supplied with the fetched bundle.
