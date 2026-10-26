# Shared Tag Picker

An independent, unofficial extension compatible with Lumiverse.

## Install from GitHub

In Lumiverse, open Extensions, choose Add Extension, and paste:

https://github.com/clovergirl99/shared-tag-picker

Install and enable the extension. Grant its requested permissions if prompted.

The checked-in frontend.js is the original compiled extension, unchanged. spindle.json points to it directly, so no build step is needed. The original ZIP is included with the original documentation and any available source files and tests.

---

# Shared Tag Picker

An independent, unofficial extension compatible with Lumiverse. It upgrades the existing character-card **Add tag** field with a shared autocomplete inspired by SillyTavern's tag picker.

Version 2.0.1 preserves the original picker and adds a **+ New tag** button to every category heading. Creating a tag saves it to that category and immediately assigns it to the character currently being edited.

Version 2.0.2 keeps that category heading and creation button visible when the picker is filtered to an individual category, not only in the **All** view.

Version 2.0.3 fixes category dividers in both the used-tag list and character cards, including layouts with custom card CSS.

Version 2.0.4 restores each saved preference independently and mirrors category settings locally, preventing one unavailable setting from flattening every tag into Uncategorized after a reload.

Version 2.0.5 automatically recovers the richer of Lumiverse's category data and the local backup, then keeps a versioned category snapshot and up to five previous layouts for restart/update safety.

Version 2.0.6 restores creator notes on character cards by matching current Lumiverse cards through their stable character IDs. If a character-list response omits full notes, the extension retrieves that character's complete record directly. Existing `.stp-card-*` CSS remains compatible.

## What it does

- Opens the complete tag library when the character editor's tag field is focused, even before you type.
- Reads Lumiverse's own `/api/v1/characters/tags` endpoint, so suggestions include tags already used by every character in the current account.
- Filters case- and accent-insensitively as you type and shows each tag's character count.
- Groups the popup's suggestions under sticky category headings (in your saved category order) with a small color dot per group and per tag, so the list is easy to scan instead of one long flat list.
- Lets you filter the popup down to a single category with a row of chips (**All**, plus one per category with a live count), so you can jump straight to, say, just your Genres tags.
- Has a **Select multiple** toggle in the popup: turn it on, check off any number of tags across categories, then apply them all with one **Add tags** click instead of reopening the popup per tag.
- Hides tags already assigned to the open card.
- Supports mouse, Up/Down, Enter, Escape, and Tab controls.
- Keeps normal new-tag creation: type a name that does not exist and choose **Create** (or use Lumiverse's + button).
- Uses Lumiverse's native input and add button to save. It does not keep a second tag database.
- Adds an always-visible, ordered tag list beneath the character browser's native Tags control.
- Shows only tags currently assigned to at least one character in that public tag list; zero-use tags remain available in the manager and autocomplete.
- Lets you hide or show that tag list and remembers the choice.
- Clicking a list tag cycles Lumiverse's native include, exclude, and neutral character filters.
- Provides **Manage tags** with custom categories and Up/Down controls for both category order and tag order.
- Lets you rename a tag everywhere, move it to another category, and choose a custom divider such as `+`, `*`, or `♡` between category groups.
- Injects creator notes and ordered tags directly into the character cards, using selectors compatible with current and legacy Lumiverse card layouts.
- Hides Lumiverse's original card tag row so tags are not duplicated beside the extension's full tag display.
- Keeps category names inside the manager; the top tag list and character cards display a continuous tag stream with dividers between groups.
- Supports a color for an entire category or an overriding color for an individual tag.
- Keeps category names and controls visible in the mobile tag manager layout.
- Lets **Manage tags** create zero-use shared tags, delete individual tags, clear one category, or delete every tag after confirmation.
- Persists categories, dividers, and the flattened shared order, then applies that order to autocomplete, the browser tag list, and every character's stored tag array.

## Install locally

1. Extract the ZIP.
2. Copy the `shared-tag-picker` folder to Lumiverse's `data/extensions/` directory.
3. In Lumiverse, open **Extensions**, choose **Import Local**, and select **Shared Tag Picker**.
4. Enable the extension. It requests no gated permissions.

The checked-in `dist/frontend.js` makes the extension ready to import without installing Bun on the Lumiverse server.

## Develop

```sh
bun install
bun run typecheck
bun test
bun run build
```

Built against `lumiverse-spindle-types` 0.6.31. The implementation follows the public Lumiverse API and the focus-to-open, filter-as-you-type interaction used by SillyTavern's tag input.

## Updating from an earlier version

Uninstall the earlier version before importing this release so Lumiverse cannot retain an older frontend bundle.

Version 1.7.0 limits the public tag list to tags currently in use and hides Lumiverse's original character-card tag row to prevent duplicate tag displays. An adapted arched-card stylesheet targeting the extension's `.stp-card-*` markup is distributed alongside the release.

Version 1.8.0 groups the **Add tag** popup by category, with sticky headers and color swatches, instead of one flat list.

Version 1.9.0 adds category filter chips and a **Select multiple** mode to the **Add tag** popup.
