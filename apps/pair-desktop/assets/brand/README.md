# pair brand assets

The split pear: a lime left half and an olive right half divided by an ivory S-curve, on a deep
forest-green tile. Generated with an image model; the prompts are in [`prompts.json`](prompts.json).

| File | What it is |
|---|---|
| `pair-app-icon.png` | The approved icon as generated, 1254 px, the tile filling almost the whole canvas. |
| `app-icon.png` | The icon source for the app: the same tile scaled to Apple's icon grid (824 px tile on a 1024 px transparent canvas), so it matches other Dock icons in size. |
| `pair-logo-transparent-draft.png` | The pear and "pair" wordmark on a transparent background. **Draft:** its edges still have speckling to clean up before it's used anywhere. |

## Regenerating the app icons

After changing `app-icon.png`, from `apps/pair-desktop`:

```bash
npx tauri icon assets/brand/app-icon.png
rm -rf src-tauri/icons/android src-tauri/icons/ios src-tauri/icons/64x64.png
sips -z 64 64 assets/brand/app-icon.png --out static/favicon.png
```

pair ships for macOS only, so the Android and iOS icons Tauri also generates are deleted.
