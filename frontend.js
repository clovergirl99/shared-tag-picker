// src/tag-model.ts
function characterIdFromActionScope(scope) {
  const prefix = "character-card:";
  const suffix = ":actions";
  if (!scope.startsWith(prefix) || !scope.endsWith(suffix))
    return null;
  const id = scope.slice(prefix.length, -suffix.length);
  return id || null;
}
function folded(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}
function normalizeTags(value) {
  if (!Array.isArray(value))
    return [];
  const seen = new Set;
  const result = [];
  for (const item of value) {
    if (!item || typeof item !== "object")
      continue;
    const record = item;
    const tag = typeof record.tag === "string" ? record.tag.trim() : "";
    const key = folded(tag);
    if (!tag || seen.has(key))
      continue;
    seen.add(key);
    result.push({ tag, count: typeof record.count === "number" && Number.isFinite(record.count) ? record.count : 0 });
  }
  return result.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
}
function orderTagCounts(tags, order) {
  const ranks = new Map(order.map((tag, index) => [folded(tag), index]));
  return [...tags].sort((a, b) => {
    const aRank = ranks.get(folded(a.tag));
    const bRank = ranks.get(folded(b.tag));
    if (aRank !== undefined || bRank !== undefined) {
      if (aRank === undefined)
        return 1;
      if (bRank === undefined)
        return -1;
      if (aRank !== bRank)
        return aRank - bRank;
    }
    return a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" });
  });
}
function orderTagNames(tags, order) {
  const counts = tags.map((tag) => ({ tag, count: 0 }));
  return orderTagCounts(counts, order).map(({ tag }) => tag);
}
function applyTagLibraryChanges(tags, order, removedTags, renamedTags = {}) {
  const removed = new Set(removedTags.map(folded));
  const renames = new Map(Object.entries(renamedTags).map(([from, to]) => [folded(from), to.trim()]));
  const seen = new Set;
  return orderTagNames(tags.map((tag) => renames.get(folded(tag)) || tag).filter((tag) => {
    const key = folded(tag);
    if (removed.has(key) || seen.has(key))
      return false;
    seen.add(key);
    return true;
  }), order);
}
function flattenCategories(categories) {
  const seen = new Set;
  const result = [];
  for (const category of categories) {
    for (const rawTag of category.tags) {
      const tag = rawTag.trim();
      const key = folded(tag);
      if (!tag || seen.has(key))
        continue;
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}
function isUncategorized(category) {
  return category.id === "uncategorized" || category.name.localeCompare("Uncategorized", undefined, { sensitivity: "base" }) === 0;
}
function chooseRicherCategoryLayout(candidates) {
  let best = [];
  let bestScore = -1;
  for (const candidate of candidates) {
    if (!Array.isArray(candidate))
      continue;
    const normalized = reconcileCategories([], candidate);
    const named = normalized.filter((category) => !isUncategorized(category));
    const assignedOutsideFallback = named.reduce((total, category) => total + category.tags.length, 0);
    const populatedNamed = named.filter((category) => category.tags.length > 0).length;
    const totalTags = normalized.reduce((total, category) => total + category.tags.length, 0);
    const score = assignedOutsideFallback * 1e6 + populatedNamed * 1e4 + named.length * 100 + totalTags;
    if (score <= bestScore)
      continue;
    bestScore = score;
    best = normalized.map((category) => ({ ...category, tags: [...category.tags] }));
  }
  return best;
}
function reconcileCategories(library, saved) {
  const ids = new Set;
  const tagKeys = new Set;
  const result = [];
  for (const [index, category] of saved.entries()) {
    if (!category || typeof category !== "object")
      continue;
    let id = typeof category.id === "string" && category.id.trim() ? category.id.trim() : `category-${index + 1}`;
    while (ids.has(id))
      id = `${id}-${index + 1}`;
    ids.add(id);
    const name = typeof category.name === "string" && category.name.trim() ? category.name.trim() : `Category ${index + 1}`;
    const categoryTags = [];
    for (const rawTag of Array.isArray(category.tags) ? category.tags : []) {
      if (typeof rawTag !== "string")
        continue;
      const tag = rawTag.trim();
      const key = folded(tag);
      if (!tag || tagKeys.has(key))
        continue;
      tagKeys.add(key);
      categoryTags.push(tag);
    }
    const color = typeof category.color === "string" && /^#[0-9a-f]{6}$/i.test(category.color) ? category.color : undefined;
    result.push({ id, name, tags: categoryTags, ...color ? { color } : {} });
  }
  if (!result.length)
    result.push({ id: "uncategorized", name: "Uncategorized", tags: [] });
  let uncategorized = result.find((category) => category.id === "uncategorized" || category.name.toLocaleLowerCase() === "uncategorized");
  if (!uncategorized) {
    uncategorized = { id: "uncategorized", name: "Uncategorized", tags: [] };
    result.push(uncategorized);
  }
  for (const item of library) {
    const key = folded(item.tag);
    if (tagKeys.has(key))
      continue;
    tagKeys.add(key);
    uncategorized.tags.push(item.tag);
  }
  return result;
}
function mergeTagLibrary(tags, savedOrder) {
  const byKey = new Map(tags.map((item) => [folded(item.tag), item]));
  const seen = new Set;
  const result = [];
  for (const saved of savedOrder) {
    const tag = saved.trim();
    const key = folded(tag);
    if (!tag || seen.has(key))
      continue;
    seen.add(key);
    result.push(byKey.get(key) ?? { tag, count: 0 });
  }
  for (const item of tags) {
    const key = folded(item.tag);
    if (seen.has(key))
      continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
function filterTags(tags, query, assigned, order = []) {
  const needle = folded(query.trim());
  const excluded = new Set(assigned.map(folded));
  return orderTagCounts(tags, order).filter(({ tag }) => !excluded.has(folded(tag)) && (!needle || folded(tag).includes(needle))).sort((a, b) => {
    if (!needle)
      return 0;
    const aName = folded(a.tag);
    const bName = folded(b.tag);
    const aPrefix = aName.startsWith(needle);
    const bPrefix = bName.startsWith(needle);
    if (aPrefix !== bPrefix)
      return aPrefix ? -1 : 1;
    return 0;
  });
}
function hasExactTag(tags, query) {
  const needle = folded(query.trim());
  return Boolean(needle) && tags.some(({ tag }) => folded(tag) === needle);
}
function groupTagsByCategory(tags, categories) {
  const owner = new Map;
  for (const category of categories) {
    for (const rawTag of category.tags) {
      const key = folded(rawTag.trim());
      if (key && !owner.has(key))
        owner.set(key, category);
    }
  }
  const fallback = categories.find((category) => category.id === "uncategorized") ?? { id: "uncategorized", name: "Uncategorized", tags: [] };
  const buckets = new Map;
  const order = [];
  for (const item of tags) {
    const category = owner.get(folded(item.tag)) ?? fallback;
    if (!buckets.has(category.id)) {
      buckets.set(category.id, []);
      order.push(category);
    }
    buckets.get(category.id).push(item);
  }
  return order.map((category) => ({ category, tags: buckets.get(category.id) ?? [] }));
}

// src/frontend.ts
var ORDER_SETTING = "tags:order";
var HIDDEN_SETTING = "tags:hidden";
var CATEGORIES_SETTING = "tags:categories";
var DIVIDER_SETTING = "tags:divider";
var TAG_COLORS_SETTING = "tags:colors";
var CATEGORY_SNAPSHOT_SETTING = "tags:categorySnapshot";
var CATEGORY_HISTORY_SETTING = "tags:categoryHistory";
var ADD_TAG_PLACEHOLDERS = new Set([
  "Add tag...",
  "Ajouter une balise...",
  "Aggiungi tag...",
  "タグを追加...",
  "添加标签...",
  "添加標籤..."
]);
var CSS = `
  .stp-host{position:relative;flex:0 0 100%;width:100%;min-width:0;height:0;overflow:visible;z-index:10000}.stp-anchor{position:relative;display:block;width:100%;min-width:0;height:0;overflow:visible}
  .stp-popup{position:absolute;z-index:10000;left:0;top:4px;width:min(420px,100%);min-width:min(260px,100%);display:none;overflow:hidden;border:1px solid var(--lumiverse-border);border-radius:9px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text);box-shadow:0 12px 30px rgba(0,0,0,.28)}.stp-popup[data-open="true"]{display:block}
  .stp-status-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px 7px 10px;border-bottom:1px solid var(--lumiverse-border)}
  .stp-status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--lumiverse-text-dim)}
  .stp-multi-toggle{flex:0 0 auto;border:1px solid var(--lumiverse-border);border-radius:999px;background:transparent;color:var(--lumiverse-text-muted);font:inherit;font-size:10px;padding:3px 9px;cursor:pointer}.stp-multi-toggle:hover{color:var(--lumiverse-text);border-color:var(--lumiverse-border-hover)}.stp-multi-toggle[data-active="true"]{border-color:var(--lumiverse-primary);color:var(--lumiverse-primary);background:var(--lumiverse-primary-020)}
  .stp-filter-bar{display:flex;flex-wrap:wrap;gap:5px;padding:7px 8px}.stp-filter-bar:empty{display:none;padding:0}
  .stp-filter-chip{border:1px solid var(--stp-chip-color,var(--lumiverse-border));border-radius:999px;background:transparent;color:var(--stp-chip-color,var(--lumiverse-text-muted));font:inherit;font-size:10.5px;padding:3px 9px;cursor:pointer}.stp-filter-chip:disabled{opacity:.35;cursor:default}.stp-filter-chip[data-active="true"]{background:color-mix(in srgb,var(--stp-chip-color,var(--lumiverse-primary)) 16%,var(--lumiverse-bg-elevated));color:var(--stp-chip-color,var(--lumiverse-primary))}
  .stp-list{max-height:min(340px,48vh);overflow:auto;padding:4px;border-top:1px solid var(--lumiverse-border)}.stp-filter-bar:empty+.stp-list{border-top:0}
  .stp-group-header{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:6px;padding:6px 9px 4px;margin-top:4px;background:var(--lumiverse-bg-elevated);font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--lumiverse-text-dim)}.stp-group-header:first-child{margin-top:0}.stp-group-swatch{flex:0 0 auto;width:7px;height:7px;border-radius:999px;background:var(--stp-swatch-color,var(--lumiverse-text-dim))}.stp-group-count{margin-left:auto;font-weight:500;text-transform:none;letter-spacing:0;opacity:.75}
  .stp-group-add{flex:0 0 auto;border:1px solid var(--lumiverse-border);border-radius:999px;background:transparent;color:var(--lumiverse-text-muted);font:inherit;font-size:9px;font-weight:600;letter-spacing:0;text-transform:none;padding:2px 7px;cursor:pointer}.stp-group-add:hover{border-color:var(--lumiverse-primary);color:var(--lumiverse-primary)}
  .stp-option{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:left;padding:8px 9px;cursor:pointer}.stp-option:hover,.stp-option[data-active="true"]{background:var(--lumiverse-primary-020,var(--lumiverse-fill-subtle));color:var(--lumiverse-primary,var(--lumiverse-text))}
  .stp-option--multi{grid-template-columns:auto auto minmax(0,1fr) auto}
  .stp-swatch{flex:0 0 auto;width:8px;height:8px;border-radius:999px;background:var(--stp-swatch-color,transparent);border:1px solid var(--lumiverse-border)}.stp-option.stp-create .stp-swatch{visibility:hidden}
  .stp-checkbox{flex:0 0 auto;width:14px;height:14px;border:1.5px solid var(--lumiverse-border);border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;line-height:1;color:var(--lumiverse-primary-contrast,#fff)}.stp-checkbox[data-checked="true"]{background:var(--lumiverse-primary);border-color:var(--lumiverse-primary)}
  .stp-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.stp-count{font-size:10px;color:var(--lumiverse-text-dim);white-space:nowrap}.stp-create .stp-name{font-weight:600}.stp-empty,.stp-error{padding:16px 10px;text-align:center;font-size:11px;color:var(--lumiverse-text-muted)}.stp-error{color:var(--lumiverse-danger,#d66)}
  .stp-multi-bar{display:none;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-top:1px solid var(--lumiverse-border);background:var(--lumiverse-bg)}.stp-multi-bar[data-visible="true"]{display:flex}.stp-multi-count{font-size:10.5px;color:var(--lumiverse-text-dim)}.stp-multi-actions{display:flex;gap:6px}.stp-multi-cancel,.stp-multi-add{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text);font:inherit;font-size:10.5px;padding:5px 9px;cursor:pointer}.stp-multi-add{border-color:var(--lumiverse-primary);background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast,#fff)}.stp-multi-cancel:disabled,.stp-multi-add:disabled{opacity:.45;cursor:not-allowed}
  .stp-library-host{display:block;width:100%;min-width:0}.stp-library{display:flex;flex-direction:column;gap:7px;padding:7px 8px 8px;border-top:1px solid var(--lumiverse-border);border-bottom:1px solid var(--lumiverse-border);background:var(--lumiverse-bg)}.stp-library[data-hidden="true"] .stp-library-tags,.stp-library[data-hidden="true"] .stp-library-note{display:none}.stp-library-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.stp-library-title{font-size:11px;font-weight:650;color:var(--lumiverse-text)}.stp-library-actions{display:flex;align-items:center;gap:5px}
  .stp-manage,.stp-toggle{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text-muted);font:inherit;font-size:10.5px;padding:4px 7px;cursor:pointer}.stp-manage:hover,.stp-toggle:hover{border-color:var(--lumiverse-border-hover);color:var(--lumiverse-text)}
  .stp-library-tags{display:flex;flex-wrap:wrap;align-items:center;gap:4px;max-height:170px;overflow:auto}.stp-library-divider{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto;align-items:center;justify-content:center;align-self:center;min-width:1em;color:var(--lumiverse-primary)!important;font-size:12px!important;font-weight:700;line-height:1!important;padding:0 3px!important;white-space:pre}.stp-filter-tag{border:1px solid var(--stp-tag-color,var(--lumiverse-border));border-radius:999px;background:color-mix(in srgb,var(--stp-tag-color,var(--lumiverse-bg-elevated)) 12%,var(--lumiverse-bg-elevated));color:var(--stp-tag-color,var(--lumiverse-text-muted));font:inherit;font-size:10.5px;line-height:1.2;padding:4px 7px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stp-filter-tag:hover{border-color:var(--lumiverse-primary);color:var(--lumiverse-text)}
  .stp-filter-tag[data-state="include"]{border-color:var(--lumiverse-primary);background:var(--lumiverse-primary-020);color:var(--lumiverse-primary)}.stp-filter-tag[data-state="exclude"]{border-color:var(--lumiverse-danger,#d66);color:var(--lumiverse-danger,#d66);text-decoration:line-through}.stp-library-note{font-size:9.5px;color:var(--lumiverse-text-dim)}
  .stp-manager{display:flex;flex-direction:column;gap:10px;color:var(--lumiverse-text)}.stp-manager-copy{font-size:11px;line-height:1.45;color:var(--lumiverse-text-muted)}.stp-category-tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(110px,160px) auto;gap:6px}.stp-divider-input,.stp-category-input,.stp-category-name{min-width:0;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-bg);color:var(--lumiverse-text);font:inherit;font-size:11.5px;padding:7px 9px;outline:none}.stp-manager-list{display:flex;flex-direction:column;gap:8px;max-height:min(500px,58vh);overflow:auto;padding:2px}.stp-category-card{display:flex;flex-direction:column;gap:6px;padding:7px;border:1px solid var(--lumiverse-border);border-radius:9px;background:var(--lumiverse-fill-subtle)}.stp-category-head{display:grid;grid-template-columns:minmax(150px,1fr) auto;gap:6px;align-items:center}.stp-category-title-tools{display:grid;grid-template-columns:minmax(120px,1fr) auto;gap:5px;align-items:center}.stp-category-actions{display:flex;gap:4px;flex-wrap:wrap}.stp-category-action{border:1px solid var(--lumiverse-border);border-radius:5px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text-muted);font:inherit;font-size:10px;padding:4px 6px;cursor:pointer}.stp-category-action[data-danger]{border-color:var(--lumiverse-danger,#d66);color:var(--lumiverse-danger,#d66)}.stp-category-tag-list{display:flex;flex-direction:column;gap:4px}.stp-color-control{display:flex;align-items:center;gap:3px}.stp-color-input{width:30px;height:28px;padding:2px;border:1px solid var(--lumiverse-border);border-radius:5px;background:var(--lumiverse-bg);cursor:pointer}.stp-color-clear{border:1px solid var(--lumiverse-border);border-radius:5px;background:transparent;color:var(--lumiverse-text-muted);font:inherit;font-size:9px;padding:4px 5px;cursor:pointer}
  .stp-add-row{display:flex;gap:6px}.stp-add-input{min-width:0;flex:1;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-bg);color:var(--lumiverse-text);font:inherit;font-size:11.5px;padding:7px 9px;outline:none}.stp-add-input:focus{border-color:var(--lumiverse-primary)}.stp-add-button{border:1px solid var(--lumiverse-primary);border-radius:7px;background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast,#fff);font:inherit;font-size:11px;padding:7px 10px;cursor:pointer}.stp-add-button:disabled{opacity:.45;cursor:not-allowed}
  .stp-manager-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto auto minmax(90px,125px) auto;align-items:center;gap:5px;padding:6px;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-bg-elevated)}.stp-manager-row[data-dragging="true"]{opacity:.45}.stp-drag{color:var(--lumiverse-text-dim);text-align:center;cursor:grab;font-size:15px}.stp-row-name{min-width:0;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--lumiverse-text);font:inherit;font-size:11.5px;padding:4px}.stp-row-name:hover,.stp-row-name:focus{border-color:var(--lumiverse-border);background:var(--lumiverse-bg);outline:none}.stp-row-count{font-size:9.5px;color:var(--lumiverse-text-dim)}.stp-category-select{min-width:0;border:1px solid var(--lumiverse-border);border-radius:5px;background:var(--lumiverse-bg);color:var(--lumiverse-text);font:inherit;font-size:10px;padding:4px}
  .stp-move,.stp-delete{width:25px;height:25px;border:1px solid var(--lumiverse-border);border-radius:5px;background:transparent;color:var(--lumiverse-text-muted);cursor:pointer}.stp-delete{border-color:color-mix(in srgb,var(--lumiverse-danger,#d66) 45%,transparent);color:var(--lumiverse-danger,#d66)}.stp-move:disabled,.stp-delete:disabled{opacity:.3;cursor:default}.stp-manager-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.stp-manager-actions button{border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text);font:inherit;font-size:11px;padding:7px 10px;cursor:pointer}.stp-manager-actions .stp-delete-all{margin-right:auto;border-color:var(--lumiverse-danger,#d66);color:var(--lumiverse-danger,#d66)}.stp-manager-actions .stp-save{border-color:var(--lumiverse-primary);background:var(--lumiverse-primary);color:var(--lumiverse-primary-contrast,#fff)}.stp-manager-actions button:disabled{opacity:.5;cursor:not-allowed}.stp-manager-progress{min-height:16px;font-size:10px;color:var(--lumiverse-text-muted)}.stp-manager-progress[data-error="true"]{color:var(--lumiverse-danger,#d66)}
  .stp-card-host{display:block;min-width:0}.stp-card-extra{display:flex;flex-direction:column;gap:5px;margin-top:5px;min-width:0}.stp-card-notes{font-size:10px;line-height:1.35;color:var(--lumiverse-text-dim);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.stp-card-notes:focus{display:block;outline:1px solid var(--lumiverse-primary);border-radius:4px}.stp-card-tags{display:flex;flex-wrap:wrap;align-items:center;gap:3px;font-size:9.5px}.stp-card-group{display:contents}.stp-card-tag{color:var(--stp-tag-color,var(--lumiverse-text-muted))}.stp-card-divider{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto;align-items:center;justify-content:center;align-self:center;min-width:1em;color:var(--lumiverse-primary)!important;font:inherit!important;font-weight:700!important;line-height:1!important;padding:0 3px!important;white-space:pre}.stp-card-empty{color:var(--lumiverse-text-dim)}
  [class*="_browser_"] [class*="_card_"] [class*="_tags_"]{display:none!important}
  @media(max-width:600px){.stp-category-tools{grid-template-columns:1fr auto}.stp-divider-input{grid-column:1/-1;grid-row:2}.stp-category-head{grid-template-columns:1fr}.stp-category-title-tools{grid-template-columns:minmax(0,1fr) auto}.stp-category-name{display:block!important;visibility:visible!important;width:100%;font-size:13px;font-weight:650}.stp-manager-row{grid-template-columns:20px minmax(70px,1fr) auto auto}.stp-manager-row .stp-category-select{grid-column:2/5;width:100%}.stp-manager-row>span:last-child{grid-column:2/5}.stp-category-actions{justify-content:flex-start}}
`;
function parseCategorySnapshot(value) {
  if (!value || typeof value !== "object")
    return null;
  const candidate = value;
  if (candidate.version !== 1 || typeof candidate.revision !== "number" || !Number.isFinite(candidate.revision) || !Array.isArray(candidate.categories))
    return null;
  return { version: 1, revision: candidate.revision, categories: chooseRicherCategoryLayout([candidate.categories]) };
}
function sameCategoryLayout(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function isTagInput(input) {
  const button = input.nextElementSibling;
  return input.type === "text" && ADD_TAG_PLACEHOLDERS.has(input.placeholder) && Boolean(input.parentElement && button instanceof HTMLButtonElement && button.type === "button");
}
function assignedTags(input) {
  const addRow = input.parentElement;
  const list = addRow?.parentElement;
  if (!addRow || !list)
    return [];
  return [...list.children].filter((child) => child !== addRow && !(child instanceof HTMLDivElement && child.dataset.spindleExt)).map((child) => (child.textContent || "").trim()).filter(Boolean);
}
function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter)
    setter.call(input, value);
  else
    input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function validColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
function characterIdFromCard(card) {
  const mount = card.querySelector('[data-spindle-mount="character_browser_card_actions"][data-spindle-scope]');
  return characterIdFromActionScope(mount?.dataset.spindleScope ?? "");
}
async function fetchJson(path, init) {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json", ...init?.body ? { "Content-Type": "application/json" } : {} }, ...init });
  if (!response.ok)
    throw new Error(`Lumiverse returned ${response.status}`);
  return await response.json();
}
async function fetchTagLibrary() {
  return normalizeTags(await fetchJson("/api/v1/characters/tags"));
}
async function fetchAllCharacters() {
  const result = [];
  let offset = 0;
  for (;; ) {
    const page = await fetchJson(`/api/v1/characters?limit=200&offset=${offset}`);
    result.push(...page.data);
    offset += page.data.length;
    if (!page.data.length || offset >= page.total)
      return result;
  }
}
function setup(ctx) {
  const pickers = new Map;
  const cardInjections = new Map;
  let library = null;
  const disposers = [ctx.dom.addStyle(CSS)];
  let tags = [];
  let tagOrder = [];
  let categories = [];
  let divider = "♡";
  let tagColors = {};
  let characters = [];
  const characterDetails = new Map;
  const characterDetailLoads = new Map;
  let listHidden = false;
  let loading = null;
  let cardsLoading = null;
  let lastLoaded = 0;
  let scanQueued = false;
  let suppressLibraryReload = false;
  let categorySnapshot = null;
  let categoryHistory = [];
  let categoryRecoveryMessage = "";
  const localKey = (key) => `spindle:${key}`;
  const readLocalJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(localKey(key));
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const readLocalText = (key, fallback) => {
    try {
      return localStorage.getItem(localKey(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const readSetting = async (key) => {
    if (!ctx.settings)
      return;
    try {
      return await ctx.settings.get(key);
    } catch {
      return;
    }
  };
  const writeLocalPreferences = () => {
    try {
      localStorage.setItem(localKey(ORDER_SETTING), JSON.stringify(tagOrder));
      localStorage.setItem(localKey(CATEGORIES_SETTING), JSON.stringify(categories));
      if (categorySnapshot)
        localStorage.setItem(localKey(CATEGORY_SNAPSHOT_SETTING), JSON.stringify(categorySnapshot));
      localStorage.setItem(localKey(CATEGORY_HISTORY_SETTING), JSON.stringify(categoryHistory));
      localStorage.setItem(localKey(DIVIDER_SETTING), divider);
      localStorage.setItem(localKey(TAG_COLORS_SETTING), JSON.stringify(tagColors));
    } catch {}
  };
  const readPreferences = async () => {
    const [settingsOrder, settingsHidden, settingsCategories, settingsDivider, settingsColors, settingsSnapshot] = await Promise.all([
      readSetting(ORDER_SETTING),
      readSetting(HIDDEN_SETTING),
      readSetting(CATEGORIES_SETTING),
      readSetting(DIVIDER_SETTING),
      readSetting(TAG_COLORS_SETTING),
      readSetting(CATEGORY_SNAPSHOT_SETTING)
    ]);
    const storedOrder = settingsOrder ?? readLocalJson(ORDER_SETTING, []);
    const localCategories = readLocalJson(CATEGORIES_SETTING, []);
    const localSnapshot = parseCategorySnapshot(readLocalJson(CATEGORY_SNAPSHOT_SETTING, null));
    const remoteSnapshot = parseCategorySnapshot(settingsSnapshot);
    const snapshots = [localSnapshot, remoteSnapshot].filter((snapshot) => Boolean(snapshot)).sort((a, b) => b.revision - a.revision);
    const storedHistory = readLocalJson(CATEGORY_HISTORY_SETTING, []);
    categoryHistory = Array.isArray(storedHistory) ? storedHistory.map(parseCategorySnapshot).filter((snapshot) => Boolean(snapshot)).sort((a, b) => b.revision - a.revision).slice(0, 5) : [];
    if (snapshots[0]) {
      categorySnapshot = snapshots[0];
      categories = categorySnapshot.categories.map((category) => ({ ...category, tags: [...category.tags] }));
      for (const snapshot of snapshots.slice(1))
        if (!sameCategoryLayout(snapshot.categories, categories) && !categoryHistory.some((saved) => sameCategoryLayout(saved.categories, snapshot.categories)))
          categoryHistory.push(snapshot);
      categoryHistory = categoryHistory.sort((a, b) => b.revision - a.revision).slice(0, 5);
    } else {
      const remoteLayout = chooseRicherCategoryLayout([settingsCategories]);
      const localLayout = chooseRicherCategoryLayout([localCategories]);
      categories = chooseRicherCategoryLayout([remoteLayout, localLayout]);
      const recoveredLocal = localLayout.length > 0 && sameCategoryLayout(categories, localLayout) && !sameCategoryLayout(localLayout, remoteLayout);
      categoryRecoveryMessage = recoveredLocal ? "Recovered your category layout from the local backup." : "";
      categorySnapshot = { version: 1, revision: Date.now(), categories: categories.map((category) => ({ ...category, tags: [...category.tags] })) };
    }
    const storedDivider = settingsDivider ?? readLocalText(DIVIDER_SETTING, "♡");
    const storedColors = settingsColors ?? readLocalJson(TAG_COLORS_SETTING, {});
    const storedHidden = settingsHidden ?? readLocalText(HIDDEN_SETTING, "false") === "true";
    if (Array.isArray(storedOrder))
      tagOrder = storedOrder.filter((value) => typeof value === "string");
    if (typeof storedDivider === "string")
      divider = storedDivider.slice(0, 8);
    if (storedColors && typeof storedColors === "object")
      tagColors = Object.fromEntries(Object.entries(storedColors).filter((entry) => validColor(entry[1])));
    listHidden = storedHidden === true;
    writeLocalPreferences();
    if (ctx.settings && categorySnapshot)
      await Promise.allSettled([
        ctx.settings.set(CATEGORIES_SETTING, categories),
        ctx.settings.set(CATEGORY_SNAPSHOT_SETTING, categorySnapshot)
      ]);
  };
  const saveOrder = async () => {
    if (!categorySnapshot || !sameCategoryLayout(categorySnapshot.categories, categories)) {
      if (categorySnapshot && !categoryHistory.some((snapshot) => sameCategoryLayout(snapshot.categories, categorySnapshot.categories)))
        categoryHistory.unshift(categorySnapshot);
      categoryHistory = categoryHistory.slice(0, 5);
      categorySnapshot = { version: 1, revision: Math.max(Date.now(), (categorySnapshot?.revision ?? 0) + 1), categories: categories.map((category) => ({ ...category, tags: [...category.tags] })) };
    }
    writeLocalPreferences();
    if (ctx.settings)
      await Promise.allSettled([
        ctx.settings.set(ORDER_SETTING, tagOrder),
        ctx.settings.set(CATEGORIES_SETTING, categories),
        ctx.settings.set(CATEGORY_SNAPSHOT_SETTING, categorySnapshot),
        ctx.settings.set(DIVIDER_SETTING, divider),
        ctx.settings.set(TAG_COLORS_SETTING, tagColors)
      ]);
  };
  const saveHidden = async () => {
    try {
      localStorage.setItem(localKey(HIDDEN_SETTING), String(listHidden));
    } catch {}
    if (ctx.settings)
      await Promise.allSettled([ctx.settings.set(HIDDEN_SETTING, listHidden)]);
  };
  const applyEditorChipOrder = (input) => {
    const addRow = input.parentElement;
    const list = addRow?.parentElement;
    if (!addRow || !list)
      return;
    const ranks = new Map(tagOrder.map((tag, index) => [tag.toLocaleLowerCase(), index]));
    for (const child of [...list.children]) {
      if (!(child instanceof HTMLElement))
        continue;
      if (child === addRow)
        child.style.order = "1000000";
      else if (child.classList.contains("stp-host") || child.dataset.spindleExt)
        child.style.order = "1000001";
      else
        child.style.order = String(ranks.get((child.textContent || "").trim().toLocaleLowerCase()) ?? 999999);
    }
  };
  const colorForTag = (tag, category) => tagColors[tag.toLocaleLowerCase()] ?? category.color;
  const dividerMarkup = (className) => divider ? `<span class="${className}" data-stp-divider="true" role="separator" aria-label="Tag category divider" style="display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto!important;min-width:1em!important">${escapeHtml(divider)}</span>` : "";
  const enforceDividerVisibility = (separator) => {
    separator.style.setProperty("display", "inline-flex", "important");
    separator.style.setProperty("visibility", "visible", "important");
    separator.style.setProperty("opacity", "1", "important");
    separator.style.setProperty("flex", "0 0 auto", "important");
    separator.style.setProperty("min-width", "1em", "important");
  };
  const clearCardInjections = () => {
    for (const wrapper of cardInjections.values()) {
      try {
        ctx.dom.uninject(wrapper);
      } catch {}
    }
    cardInjections.clear();
  };
  const updateInjectedCreatorNotes = (character, error = false) => {
    for (const wrapper of cardInjections.values()) {
      const extra = wrapper.querySelector(".stp-card-extra");
      if (extra?.dataset.stpCharacterId !== character.id)
        continue;
      const notes = extra.querySelector(".stp-card-notes");
      if (!notes)
        continue;
      notes.textContent = error ? "Creator notes unavailable" : character.creator_notes?.trim() || "No creator notes";
      notes.dataset.loading = "false";
    }
  };
  const loadCharacterDetail = (summary) => {
    if (characterDetails.has(summary.id) || characterDetailLoads.has(summary.id))
      return;
    const request = fetchJson(`/api/v1/characters/${encodeURIComponent(summary.id)}`).then((detail) => {
      const complete = { ...summary, ...detail };
      characterDetails.set(summary.id, complete);
      updateInjectedCreatorNotes(complete);
    }).catch(() => updateInjectedCreatorNotes(summary, typeof summary.creator_notes !== "string")).finally(() => {
      characterDetailLoads.delete(summary.id);
    });
    characterDetailLoads.set(summary.id, request);
  };
  const renderCharacterCards = () => {
    for (const [info, wrapper] of [...cardInjections])
      if (!info.isConnected || !wrapper.isConnected)
        cardInjections.delete(info);
    const byId = new Map(characters.map((character) => [character.id, character]));
    const byName = new Map(characters.filter((character) => character.name).map((character) => [character.name, character]));
    const candidates = [
      ...document.querySelectorAll('[class*="_browser_"] [class*="_card_"]'),
      ...document.querySelectorAll('[class*="_browser_"] [class*="_row_"]:not(:has([class*="_card_"]))')
    ];
    for (const card of candidates) {
      const image = card.querySelector('[class*="_imageWrap_"] img[alt], [class*="_avatar_"] img[alt]');
      const info = card.querySelector('[class*="_info_"]');
      const stableId = characterIdFromCard(card);
      const summary = (stableId ? byId.get(stableId) : undefined) ?? (image?.alt ? byName.get(image.alt) : undefined);
      const character = summary ? characterDetails.get(summary.id) ?? summary : undefined;
      if (!info || !character || cardInjections.has(info))
        continue;
      const assigned = new Set((character.tags ?? []).map((tag) => tag.toLocaleLowerCase()));
      const assignedItems = mergeTagLibrary(tags, tagOrder).filter(({ tag }) => assigned.has(tag.toLocaleLowerCase()));
      const groups = groupTagsByCategory(assignedItems, categories);
      const groupHtml = groups.map(({ category, tags: groupTags }, index) => {
        const separator = index ? dividerMarkup("stp-card-divider") : "";
        const tagHtml = groupTags.map(({ tag }) => {
          const color = colorForTag(tag, category);
          return `<span class="stp-card-tag"${color ? ` style="--stp-tag-color:${color}"` : ""}>${escapeHtml(tag)}</span>`;
        }).join('<span aria-hidden="true"> · </span>');
        return `${separator}<span class="stp-card-group">${tagHtml}</span>`;
      }).join("");
      const notesKnown = typeof character.creator_notes === "string";
      const notes = escapeHtml(notesKnown ? character.creator_notes.trim() || "No creator notes" : "Loading creator notes…");
      const tagsHtml = groupHtml || '<span class="stp-card-empty">No tags</span>';
      const wrapper = ctx.dom.inject(info, `<div class="stp-card-extra" data-stp-character-id="${escapeHtml(character.id)}"><div class="stp-card-notes" data-loading="${String(!notesKnown)}" tabindex="0" role="region" aria-label="Creator notes for ${escapeHtml(character.name || "character")}">${notes}</div><div class="stp-card-tags">${tagsHtml}</div></div>`, "beforeend");
      wrapper.classList.add("stp-card-host");
      cardInjections.set(info, wrapper);
      if (!characterDetails.has(character.id))
        loadCharacterDetail(character);
    }
  };
  const refreshCharacterCards = () => {
    clearCardInjections();
    renderCharacterCards();
  };
  const rerender = () => {
    if (!categories.length && tagOrder.length)
      categories = [{ id: "uncategorized", name: "Uncategorized", tags: [...tagOrder] }];
    categories = reconcileCategories(tags, categories);
    tagOrder = flattenCategories(categories);
    for (const picker of pickers.values())
      picker.render();
    library?.render();
    for (const input of pickers.keys())
      applyEditorChipOrder(input);
    refreshCharacterCards();
  };
  const loadTags = (force = false) => {
    if (loading)
      return loading;
    if (!force && tags.length && Date.now() - lastLoaded < 15000)
      return Promise.resolve();
    loading = fetchTagLibrary().then((next) => {
      tags = next;
      lastLoaded = Date.now();
      rerender();
    }).finally(() => {
      loading = null;
    });
    return loading;
  };
  const loadCharacters = (force = false) => {
    if (cardsLoading)
      return cardsLoading;
    if (!force && characters.length)
      return Promise.resolve();
    cardsLoading = fetchAllCharacters().then((next) => {
      characters = next;
      if (force)
        characterDetails.clear();
      refreshCharacterCards();
    }).finally(() => {
      cardsLoading = null;
    });
    return cardsLoading;
  };
  const syncCharacterTagOrder = async (removedTags, renamedTags, progress) => {
    progress("Loading characters…");
    const characters = await fetchAllCharacters();
    const changes = characters.map((character) => {
      return { character, ordered: applyTagLibraryChanges(character.tags ?? [], tagOrder, removedTags, renamedTags) };
    }).filter(({ character, ordered }) => JSON.stringify(character.tags ?? []) !== JSON.stringify(ordered));
    if (!changes.length)
      return { updated: 0, failed: 0 };
    let cursor = 0;
    let updated = 0;
    let failed = 0;
    const worker = async () => {
      for (;; ) {
        const change = changes[cursor++];
        if (!change)
          return;
        progress(`Applying order to characters… ${updated + failed}/${changes.length}`);
        try {
          await fetchJson(`/api/v1/characters/${encodeURIComponent(change.character.id)}`, { method: "PUT", body: JSON.stringify({ tags: change.ordered }) });
          updated += 1;
        } catch {
          failed += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, changes.length) }, () => worker()));
    return { updated, failed };
  };
  const openManager = () => {
    const modal = ctx.ui.showModal({ title: "Manage tag categories · v2.0.5", width: 650, maxHeight: 780, persistent: true });
    modal.root.innerHTML = '<div class="stp-manager"><div class="stp-manager-copy">Create categories, arrange them in card order, and rename or arrange tags inside each category. A tag color overrides its category color. Category names stay in this manager; the tag list and character cards show only tags with dividers between groups.</div><div class="stp-category-tools"><input class="stp-category-input" type="text" maxlength="64" placeholder="New category name…"><input class="stp-divider-input" type="text" maxlength="8" aria-label="Divider between tag groups" placeholder="Group divider, e.g. ♡"><button type="button" class="stp-add-button" data-action="add-category" disabled>Add category</button></div><div class="stp-manager-list"></div><div class="stp-manager-progress" aria-live="polite"></div><div class="stp-manager-actions"><button type="button" class="stp-delete-all" data-action="delete-all">Delete all tags</button><button type="button" data-action="restore-backup">Restore previous layout</button><button type="button" data-action="cancel">Cancel</button><button type="button" class="stp-save" data-action="save">Save &amp; apply</button></div></div>';
    const list = modal.root.querySelector(".stp-manager-list");
    const status = modal.root.querySelector(".stp-manager-progress");
    const categoryInput = modal.root.querySelector(".stp-category-input");
    const dividerInput = modal.root.querySelector(".stp-divider-input");
    const addCategoryButton = modal.root.querySelector('[data-action="add-category"]');
    const save = modal.root.querySelector('[data-action="save"]');
    const deleteAll = modal.root.querySelector('[data-action="delete-all"]');
    const restoreBackup = modal.root.querySelector('[data-action="restore-backup"]');
    const cancel = modal.root.querySelector('[data-action="cancel"]');
    const completeLibrary = mergeTagLibrary(tags, tagOrder);
    const counts = new Map(completeLibrary.map((item) => [item.tag.toLocaleLowerCase(), item.count]));
    let draft = reconcileCategories(tags, categories).map((category) => ({ ...category, tags: [...category.tags] }));
    let draftTagColors = { ...tagColors };
    const original = flattenCategories(draft);
    const renameSources = new Map(original.map((tag) => [tag.toLocaleLowerCase(), tag]));
    let busy = false;
    status.textContent = categoryRecoveryMessage;
    categoryRecoveryMessage = "";
    dividerInput.value = divider;
    const allDraftTags = () => flattenCategories(draft);
    const uniqueCategoryId = () => `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const moveCategory = (from, to) => {
      if (from === to || from < 0 || to < 0 || from >= draft.length || to >= draft.length)
        return;
      const next = [...draft];
      const [item] = next.splice(from, 1);
      if (!item)
        return;
      next.splice(to, 0, item);
      draft = next;
      render();
    };
    const moveTag = (categoryIndex, from, to) => {
      const category = draft[categoryIndex];
      if (!category || from === to || from < 0 || to < 0 || from >= category.tags.length || to >= category.tags.length)
        return;
      const next = [...category.tags];
      const [item] = next.splice(from, 1);
      if (!item)
        return;
      next.splice(to, 0, item);
      category.tags = next;
      render();
    };
    const addCategory = () => {
      const name = categoryInput.value.trim();
      if (!name || draft.some((category) => category.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0))
        return;
      draft.push({ id: uniqueCategoryId(), name, tags: [] });
      categoryInput.value = "";
      addCategoryButton.disabled = true;
      render();
      list.lastElementChild?.scrollIntoView({ block: "nearest" });
    };
    const uncategorizedIndex = (excluding = -1) => {
      const existing = draft.findIndex((category, index) => index !== excluding && category.name.localeCompare("Uncategorized", undefined, { sensitivity: "base" }) === 0);
      if (existing >= 0)
        return existing;
      draft.push({ id: uniqueCategoryId(), name: "Uncategorized", tags: [] });
      return draft.length - 1;
    };
    const render = () => {
      list.replaceChildren();
      draft.forEach((category, categoryIndex) => {
        const card = document.createElement("section");
        card.className = "stp-category-card";
        card.innerHTML = '<div class="stp-category-head"><div class="stp-category-title-tools"><input class="stp-category-name" type="text" maxlength="64" aria-label="Category name"><span class="stp-color-control"><input class="stp-color-input" type="color" aria-label="Category color"><button type="button" class="stp-color-clear" data-clear-category-color>Default</button></span></div><div class="stp-category-actions"><button type="button" class="stp-category-action" data-category-up aria-label="Move category up">↑ Category</button><button type="button" class="stp-category-action" data-category-down aria-label="Move category down">↓ Category</button><button type="button" class="stp-category-action" data-clear-category data-danger>Delete all tags here</button><button type="button" class="stp-category-action" data-delete-category data-danger>Delete category</button></div></div><div class="stp-add-row"><input class="stp-add-input" type="text" maxlength="128" placeholder="Add a tag to this category…"><button type="button" class="stp-add-button" disabled>Add tag</button></div><div class="stp-category-tag-list"></div>';
        const nameInput = card.querySelector(".stp-category-name");
        nameInput.value = category.name;
        nameInput.disabled = busy;
        nameInput.addEventListener("input", () => {
          category.name = nameInput.value;
        });
        const categoryColor = card.querySelector(".stp-color-input");
        categoryColor.value = category.color ?? "#b86aa0";
        categoryColor.disabled = busy;
        categoryColor.addEventListener("input", () => {
          category.color = categoryColor.value;
        });
        const clearCategoryColor = card.querySelector("[data-clear-category-color]");
        clearCategoryColor.disabled = busy || !category.color;
        clearCategoryColor.addEventListener("click", () => {
          delete category.color;
          render();
        });
        const categoryUp = card.querySelector("[data-category-up]");
        const categoryDown = card.querySelector("[data-category-down]");
        categoryUp.disabled = busy || categoryIndex === 0;
        categoryDown.disabled = busy || categoryIndex === draft.length - 1;
        categoryUp.addEventListener("click", () => moveCategory(categoryIndex, categoryIndex - 1));
        categoryDown.addEventListener("click", () => moveCategory(categoryIndex, categoryIndex + 1));
        card.querySelector("[data-clear-category]").addEventListener("click", () => {
          if (busy || !category.tags.length)
            return;
          ctx.ui.showConfirm({ title: `Delete all tags in ${category.name || "this category"}?`, message: "If you save, these tags will be removed from every character.", variant: "danger", confirmLabel: "Stage deletion", cancelLabel: "Cancel" }).then(({ confirmed }) => {
            if (confirmed) {
              category.tags.forEach((tag) => {
                const key = tag.toLocaleLowerCase();
                delete draftTagColors[key];
                renameSources.delete(key);
              });
              category.tags = [];
              render();
            }
          });
        });
        card.querySelector("[data-delete-category]").addEventListener("click", () => {
          if (busy)
            return;
          if (draft.length === 1) {
            category.name = "Uncategorized";
            nameInput.value = category.name;
            return;
          }
          const targetIndex = uncategorizedIndex(categoryIndex);
          const target = draft[targetIndex];
          target.tags.push(...category.tags);
          draft.splice(categoryIndex, 1);
          render();
        });
        const addInput = card.querySelector(".stp-add-input");
        const addButton = card.querySelector(".stp-add-button");
        const updateAdd = () => {
          const value = addInput.value.trim();
          addButton.disabled = busy || !value || allDraftTags().some((tag) => tag.localeCompare(value, undefined, { sensitivity: "base" }) === 0);
        };
        const addTag = () => {
          const value = addInput.value.trim();
          updateAdd();
          if (addButton.disabled)
            return;
          category.tags.push(value);
          counts.set(value.toLocaleLowerCase(), 0);
          addInput.value = "";
          render();
        };
        addInput.disabled = busy;
        addInput.addEventListener("input", updateAdd);
        addInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addTag();
          }
        });
        addButton.addEventListener("click", addTag);
        const tagList = card.querySelector(".stp-category-tag-list");
        category.tags.forEach((tag, tagIndex) => {
          const row = document.createElement("div");
          row.className = "stp-manager-row";
          row.innerHTML = '<span class="stp-drag" aria-hidden="true">☷</span><input class="stp-row-name" type="text" maxlength="128" aria-label="Rename tag"><span class="stp-row-count"></span><span class="stp-color-control"><input class="stp-color-input" type="color" aria-label="Tag color"><button type="button" class="stp-color-clear" data-clear-tag-color>Use category</button></span><select class="stp-category-select" aria-label="Move tag to category"></select><span><button type="button" class="stp-move" data-move="up" aria-label="Move tag up">↑</button> <button type="button" class="stp-move" data-move="down" aria-label="Move tag down">↓</button> <button type="button" class="stp-delete" data-delete aria-label="Delete tag">×</button></span>';
          const tagNameInput = row.querySelector(".stp-row-name");
          tagNameInput.value = tag;
          tagNameInput.disabled = busy;
          row.querySelector(".stp-row-count").textContent = String(counts.get(tag.toLocaleLowerCase()) ?? 0);
          const tagKey = tag.toLocaleLowerCase();
          const tagColor = row.querySelector(".stp-color-input");
          tagColor.value = draftTagColors[tagKey] ?? category.color ?? "#b86aa0";
          tagColor.disabled = busy;
          tagNameInput.addEventListener("change", () => {
            const nextName = tagNameInput.value.trim();
            const nextKey = nextName.toLocaleLowerCase();
            if (!nextName || allDraftTags().some((candidate) => candidate.toLocaleLowerCase() === nextKey && candidate.toLocaleLowerCase() !== tagKey)) {
              tagNameInput.value = tag;
              return;
            }
            const source = renameSources.get(tagKey) ?? tag;
            renameSources.delete(tagKey);
            renameSources.set(nextKey, source);
            if (draftTagColors[tagKey]) {
              draftTagColors[nextKey] = draftTagColors[tagKey];
              delete draftTagColors[tagKey];
            }
            if (counts.has(tagKey)) {
              counts.set(nextKey, counts.get(tagKey));
              counts.delete(tagKey);
            }
            category.tags[tagIndex] = nextName;
            render();
          });
          tagColor.addEventListener("input", () => {
            draftTagColors[tagKey] = tagColor.value;
          });
          const clearTagColor = row.querySelector("[data-clear-tag-color]");
          clearTagColor.disabled = busy || !draftTagColors[tagKey];
          clearTagColor.addEventListener("click", () => {
            delete draftTagColors[tagKey];
            render();
          });
          const select = row.querySelector(".stp-category-select");
          draft.forEach((choice, choiceIndex) => {
            const option = document.createElement("option");
            option.value = String(choiceIndex);
            option.textContent = choice.name || "Untitled category";
            option.selected = choiceIndex === categoryIndex;
            select.appendChild(option);
          });
          select.disabled = busy;
          select.addEventListener("change", () => {
            const target = draft[Number(select.value)];
            if (!target || target === category)
              return;
            category.tags.splice(tagIndex, 1);
            target.tags.push(tag);
            render();
          });
          const up = row.querySelector('[data-move="up"]');
          const down = row.querySelector('[data-move="down"]');
          const remove = row.querySelector("[data-delete]");
          up.disabled = busy || tagIndex === 0;
          down.disabled = busy || tagIndex === category.tags.length - 1;
          remove.disabled = busy;
          up.addEventListener("click", () => moveTag(categoryIndex, tagIndex, tagIndex - 1));
          down.addEventListener("click", () => moveTag(categoryIndex, tagIndex, tagIndex + 1));
          remove.addEventListener("click", () => {
            category.tags.splice(tagIndex, 1);
            delete draftTagColors[tagKey];
            renameSources.delete(tagKey);
            render();
          });
          tagList.appendChild(row);
        });
        if (!category.tags.length) {
          const empty = document.createElement("div");
          empty.className = "stp-empty";
          empty.textContent = "No tags in this category.";
          tagList.appendChild(empty);
        }
        list.appendChild(card);
      });
      if (!draft.length) {
        const empty = document.createElement("div");
        empty.className = "stp-empty";
        empty.textContent = "No categories yet. Add one above.";
        list.appendChild(empty);
      }
    };
    categoryInput.addEventListener("input", () => {
      addCategoryButton.disabled = busy || !categoryInput.value.trim() || draft.some((category) => category.name.localeCompare(categoryInput.value.trim(), undefined, { sensitivity: "base" }) === 0);
    });
    categoryInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !addCategoryButton.disabled) {
        event.preventDefault();
        addCategory();
      }
    });
    addCategoryButton.addEventListener("click", addCategory);
    restoreBackup.disabled = categoryHistory.length === 0;
    restoreBackup.addEventListener("click", () => {
      if (busy || !categoryHistory[0])
        return;
      draft = categoryHistory[0].categories.map((category) => ({ ...category, tags: [...category.tags] }));
      status.textContent = "Previous category layout loaded. Choose Save & apply to keep it.";
      render();
    });
    cancel.addEventListener("click", () => {
      if (!busy)
        modal.dismiss();
    });
    deleteAll.addEventListener("click", () => {
      if (busy || !allDraftTags().length)
        return;
      ctx.ui.showConfirm({ title: "Stage deletion of all tags?", message: "If you then choose Save & apply, every tag will be removed from every character. Categories will remain.", variant: "danger", confirmLabel: "Stage delete all", cancelLabel: "Cancel" }).then(({ confirmed }) => {
        if (confirmed) {
          draft.forEach((category) => {
            category.tags = [];
          });
          draftTagColors = {};
          renameSources.clear();
          render();
        }
      });
    });
    save.addEventListener("click", () => {
      if (busy)
        return;
      const cleanDraft = draft.map((category) => ({ ...category, name: category.name.trim() || "Untitled category", tags: [...category.tags] }));
      if (!cleanDraft.length)
        cleanDraft.push({ id: uniqueCategoryId(), name: "Uncategorized", tags: [] });
      const draftOrder = flattenCategories(cleanDraft);
      const draftKeys = new Set(draftOrder.map((tag) => tag.toLocaleLowerCase()));
      const renamedTags = {};
      for (const [currentKey, source] of renameSources) {
        const current = draftOrder.find((tag) => tag.toLocaleLowerCase() === currentKey);
        if (current && source.toLocaleLowerCase() !== currentKey)
          renamedTags[source] = current;
      }
      const renamedSourceKeys = new Set(Object.keys(renamedTags).map((tag) => tag.toLocaleLowerCase()));
      const removed = original.filter((tag) => !draftKeys.has(tag.toLocaleLowerCase()) && !renamedSourceKeys.has(tag.toLocaleLowerCase()));
      busy = true;
      suppressLibraryReload = true;
      save.disabled = deleteAll.disabled = cancel.disabled = categoryInput.disabled = dividerInput.disabled = addCategoryButton.disabled = true;
      status.dataset.error = "false";
      categories = cleanDraft.map((category) => ({ ...category, tags: [...category.tags] }));
      divider = dividerInput.value.slice(0, 8);
      tagColors = { ...draftTagColors };
      tagOrder = draftOrder;
      render();
      saveOrder().then(() => syncCharacterTagOrder(removed, renamedTags, (message) => {
        status.textContent = message;
      })).then(async ({ updated, failed }) => {
        categories = cleanDraft.map((category) => ({ ...category, tags: [...category.tags] }));
        tagOrder = [...draftOrder];
        lastLoaded = 0;
        await Promise.all([loadTags(true), loadCharacters(true)]);
        suppressLibraryReload = false;
        if (failed) {
          status.textContent = `Changes saved. Updated ${updated} characters; ${failed} could not be updated.`;
          status.dataset.error = "true";
          busy = false;
          cancel.textContent = "Close";
          cancel.disabled = false;
        } else {
          status.textContent = `Changes saved${updated ? ` and applied to ${updated} characters` : ""}.`;
          window.setTimeout(() => modal.dismiss(), 650);
        }
      }).catch((reason) => {
        suppressLibraryReload = false;
        status.textContent = reason instanceof Error ? reason.message : "Could not save tag changes.";
        status.dataset.error = "true";
        busy = false;
        save.disabled = deleteAll.disabled = cancel.disabled = categoryInput.disabled = dividerInput.disabled = false;
        addCategoryButton.disabled = !categoryInput.value.trim();
        render();
      });
    });
    render();
  };
  const cycleNativeTag = (nativeRoot, tag, chip) => {
    const trigger = nativeRoot.querySelector(":scope > button");
    if (!trigger)
      return;
    if (!nativeRoot.querySelector('input[type="text"]'))
      trigger.click();
    queueMicrotask(() => {
      const item = [...nativeRoot.querySelectorAll("button")].find((button) => button !== trigger && [...button.querySelectorAll("span")].some((span) => span.textContent?.trim() === tag));
      if (!item) {
        if (nativeRoot.querySelector('input[type="text"]'))
          trigger.click();
        return;
      }
      item.click();
      queueMicrotask(() => {
        chip.dataset.state = item.querySelector("svg.lucide-check") ? "include" : item.querySelector("svg.lucide-ban") ? "exclude" : "neutral";
        if (nativeRoot.querySelector('input[type="text"]'))
          trigger.click();
      });
    });
  };
  const mountLibrary = (root, nativeRoot) => {
    if (library?.root === root && library.wrapper.isConnected)
      return;
    library?.destroy();
    const wrapper = ctx.dom.inject(nativeRoot, '<section class="stp-library" aria-label="Character tag list"><div class="stp-library-head"><span class="stp-library-title">Tag list</span><span class="stp-library-actions"><button type="button" class="stp-toggle">Hide</button><button type="button" class="stp-manage">Manage tags</button></span></div><div class="stp-library-tags"></div><div class="stp-library-note">Click a tag to include, exclude, then clear its character filter.</div></section>', "afterend");
    wrapper.classList.add("stp-library-host");
    const list = wrapper.querySelector(".stp-library-tags");
    const section = wrapper.querySelector(".stp-library");
    const toggle = wrapper.querySelector(".stp-toggle");
    wrapper.querySelector(".stp-manage").addEventListener("click", openManager);
    toggle.addEventListener("click", () => {
      listHidden = !listHidden;
      controller.render();
      saveHidden();
    });
    let destroyed = false;
    const controller = { root, wrapper, render() {
      if (destroyed)
        return;
      section.dataset.hidden = String(listHidden);
      toggle.textContent = listHidden ? "Show" : "Hide";
      toggle.setAttribute("aria-expanded", String(!listHidden));
      list.replaceChildren();
      const completeLibrary = mergeTagLibrary(tags, tagOrder);
      const visibleGroups = groupTagsByCategory(completeLibrary.filter(({ count }) => count > 0), categories);
      visibleGroups.forEach(({ category, tags: groupTags }, categoryIndex) => {
        if (categoryIndex && divider) {
          const separator = document.createElement("span");
          separator.className = "stp-library-divider";
          separator.dataset.stpDivider = "true";
          separator.textContent = divider;
          separator.setAttribute("role", "separator");
          separator.setAttribute("aria-label", "Tag category divider");
          enforceDividerVisibility(separator);
          list.appendChild(separator);
        }
        groupTags.forEach(({ tag, count }) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "stp-filter-tag";
          chip.dataset.state = "neutral";
          chip.textContent = tag;
          chip.title = `${count} character${count === 1 ? "" : "s"} · click to cycle filter`;
          const color = colorForTag(tag, category);
          if (color)
            chip.style.setProperty("--stp-tag-color", color);
          chip.addEventListener("click", () => cycleNativeTag(nativeRoot, tag, chip));
          list.appendChild(chip);
        });
      });
      if (!visibleGroups.length) {
        const empty = document.createElement("div");
        empty.className = "stp-empty";
        empty.textContent = loading ? "Loading tags…" : "No shared tags yet.";
        list.appendChild(empty);
      }
    }, destroy() {
      if (destroyed)
        return;
      destroyed = true;
      ctx.dom.uninject(wrapper);
      if (library === controller)
        library = null;
    } };
    library = controller;
    controller.render();
  };
  const mountPicker = (input) => {
    const addRow = input.parentElement;
    if (!addRow)
      return;
    const old = pickers.get(input);
    if (old?.wrapper.isConnected) {
      applyEditorChipOrder(input);
      return;
    }
    old?.destroy();
    const wrapper = ctx.dom.inject(addRow, '<div class="stp-anchor"><div class="stp-popup" role="listbox" aria-label="Existing character tags" data-open="false"><div class="stp-status-row"><div class="stp-status" aria-live="polite">Loading existing tags…</div><button type="button" class="stp-multi-toggle" aria-pressed="false">Select multiple</button></div><div class="stp-filter-bar" role="tablist" aria-label="Filter by category"></div><div class="stp-list"></div><div class="stp-multi-bar" data-visible="false"><span class="stp-multi-count">0 selected</span><span class="stp-multi-actions"><button type="button" class="stp-multi-cancel" disabled>Clear</button><button type="button" class="stp-multi-add" disabled>Add tags</button></span></div></div></div>', "afterend");
    wrapper.classList.add("stp-host");
    const popup = wrapper.querySelector(".stp-popup");
    const status = wrapper.querySelector(".stp-status");
    const list = wrapper.querySelector(".stp-list");
    const listId = `stp-list-${Math.random().toString(36).slice(2)}`;
    const filterBar = wrapper.querySelector(".stp-filter-bar");
    const multiToggle = wrapper.querySelector(".stp-multi-toggle");
    const multiBar = wrapper.querySelector(".stp-multi-bar");
    const multiCount = wrapper.querySelector(".stp-multi-count");
    const multiAddButton = wrapper.querySelector(".stp-multi-add");
    const multiCancelButton = wrapper.querySelector(".stp-multi-cancel");
    popup.id = listId;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listId);
    input.setAttribute("aria-expanded", "false");
    let active = -1;
    let visibleValues = [];
    let createIndex = -1;
    let open = false;
    let destroyed = false;
    let multiMode = false;
    let categoryFilter = null;
    const selected = new Map;
    const setOpen = (value) => {
      open = value;
      popup.dataset.open = String(value);
      input.setAttribute("aria-expanded", String(value));
      if (!value) {
        active = -1;
        input.removeAttribute("aria-activedescendant");
      }
    };
    const select = (value) => {
      const addButton = input.nextElementSibling;
      setReactInputValue(input, value);
      window.setTimeout(() => {
        if (addButton instanceof HTMLButtonElement && !addButton.disabled)
          addButton.click();
        setOpen(false);
        input.focus();
        loadTags(true);
      }, 0);
    };
    const openCategoryCreator = (category) => {
      setOpen(false);
      const modal = ctx.ui.showModal({ title: `New tag in ${category.name}`, width: 420, persistent: true });
      modal.root.innerHTML = '<div class="stp-manager"><div class="stp-manager-copy">Create a tag in this category and apply it to the character currently being edited.</div><div class="stp-add-row"><input class="stp-add-input" type="text" maxlength="128" placeholder="New tag name…"><button type="button" class="stp-add-button" disabled>Add &amp; assign</button></div><div class="stp-manager-progress" aria-live="polite"></div><div class="stp-manager-actions"><button type="button" data-cancel>Cancel</button></div></div>';
      const createInput = modal.root.querySelector(".stp-add-input");
      const createButton = modal.root.querySelector(".stp-add-button");
      const creatorStatus = modal.root.querySelector(".stp-manager-progress");
      const cancel = modal.root.querySelector("[data-cancel]");
      let busy = false;
      const update = () => {
        const value = createInput.value.trim();
        createButton.disabled = busy || !value || hasExactTag(mergeTagLibrary(tags, tagOrder), value);
      };
      const submit = async () => {
        update();
        if (createButton.disabled)
          return;
        const value = createInput.value.trim();
        const categoryIndex = categories.findIndex((candidate) => candidate.id === category.id);
        if (categoryIndex < 0) {
          creatorStatus.textContent = "That category is no longer available.";
          return;
        }
        const previousCategories = categories;
        const previousOrder = tagOrder;
        const previousTags = tags;
        categories = categories.map((candidate, index) => index === categoryIndex ? { ...candidate, tags: [...candidate.tags, value] } : { ...candidate, tags: [...candidate.tags] });
        tagOrder = flattenCategories(categories);
        if (!hasExactTag(tags, value))
          tags = [...tags, { tag: value, count: 0 }];
        busy = true;
        createInput.disabled = cancel.disabled = true;
        createButton.disabled = true;
        creatorStatus.textContent = "Saving and assigning tag…";
        try {
          await saveOrder();
          modal.dismiss();
          select(value);
          rerender();
        } catch (reason) {
          categories = previousCategories;
          tagOrder = previousOrder;
          tags = previousTags;
          busy = false;
          createInput.disabled = cancel.disabled = false;
          creatorStatus.textContent = reason instanceof Error ? reason.message : "Could not save the new tag.";
          creatorStatus.dataset.error = "true";
          update();
        }
      };
      createInput.addEventListener("input", update);
      createInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      });
      createButton.addEventListener("click", () => {
        submit();
      });
      cancel.addEventListener("click", () => {
        if (!busy)
          modal.dismiss();
      });
      window.setTimeout(() => createInput.focus(), 0);
    };
    const toggleSelected = (value) => {
      const key = value.toLocaleLowerCase();
      if (selected.has(key))
        selected.delete(key);
      else
        selected.set(key, value);
      render();
    };
    const applySelected = async () => {
      if (!selected.size)
        return;
      const values = [...selected.values()];
      const addButton = input.nextElementSibling;
      multiAddButton.disabled = true;
      multiCancelButton.disabled = true;
      status.textContent = `Adding ${values.length} tag${values.length === 1 ? "" : "s"}…`;
      for (const value of values) {
        setReactInputValue(input, value);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        if (addButton instanceof HTMLButtonElement && !addButton.disabled)
          addButton.click();
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      setReactInputValue(input, "");
      selected.clear();
      input.focus();
      await loadTags(true);
      render();
    };
    const updateActive = () => {
      const options = [...list.querySelectorAll(".stp-option")];
      options.forEach((option, index) => {
        option.dataset.active = String(index === active);
        option.setAttribute("aria-selected", String(index === active));
      });
      const current = options[active];
      if (current) {
        if (!current.id)
          current.id = `${listId}-option-${active}`;
        input.setAttribute("aria-activedescendant", current.id);
        current.scrollIntoView({ block: "nearest" });
      } else
        input.removeAttribute("aria-activedescendant");
    };
    const render = () => {
      if (destroyed)
        return;
      applyEditorChipOrder(input);
      const query = input.value.trim();
      const completeTags = mergeTagLibrary(tags, tagOrder);
      const matches = filterTags(completeTags, query, assignedTags(input), tagOrder);
      const allowCreate = Boolean(query) && !hasExactTag(completeTags, query);
      const groups = groupTagsByCategory(matches, categories);
      if (categoryFilter && !categories.some((category) => category.id === categoryFilter))
        categoryFilter = null;
      filterBar.replaceChildren();
      const chipCategories = categories.filter((category) => category.tags.length);
      if (chipCategories.length > 1) {
        const counts = new Map(groups.map((group) => [group.category.id, group.tags.length]));
        const allChip = document.createElement("button");
        allChip.type = "button";
        allChip.className = "stp-filter-chip";
        allChip.dataset.active = String(categoryFilter === null);
        allChip.setAttribute("role", "tab");
        allChip.textContent = `All (${matches.length})`;
        allChip.addEventListener("click", () => {
          categoryFilter = null;
          render();
        });
        filterBar.appendChild(allChip);
        for (const category of chipCategories) {
          const count = counts.get(category.id) ?? 0;
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "stp-filter-chip";
          chip.dataset.active = String(categoryFilter === category.id);
          chip.setAttribute("role", "tab");
          chip.disabled = count === 0 && categoryFilter !== category.id;
          if (category.color)
            chip.style.setProperty("--stp-chip-color", category.color);
          chip.textContent = `${category.name} (${count})`;
          chip.addEventListener("click", () => {
            categoryFilter = categoryFilter === category.id ? null : category.id;
            render();
          });
          filterBar.appendChild(chip);
        }
      } else
        categoryFilter = null;
      const shownGroups = categoryFilter ? groups.filter((group) => group.category.id === categoryFilter) : groups;
      visibleValues = [...allowCreate ? [query] : [], ...shownGroups.flatMap((group) => group.tags.map((item) => item.tag))];
      createIndex = allowCreate ? 0 : -1;
      if (active >= visibleValues.length)
        active = visibleValues.length - 1;
      list.replaceChildren();
      const shownCount = shownGroups.reduce((sum, group) => sum + group.tags.length, 0);
      const scopeLabel = categoryFilter ? ` in ${categories.find((category) => category.id === categoryFilter)?.name ?? ""}` : "";
      status.textContent = loading ? "Loading existing tags…" : `${shownCount} existing tag${shownCount === 1 ? "" : "s"}${scopeLabel}${query ? " match" : " available"}`;
      const addOption = (value, countText, create, index, color) => {
        const isMulti = !create && multiMode;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `stp-option${create ? " stp-create" : ""}${isMulti ? " stp-option--multi" : ""}`;
        button.dataset.index = String(index);
        button.id = `${listId}-option-${index}`;
        button.setAttribute("role", "option");
        button.innerHTML = `${isMulti ? '<span class="stp-checkbox" aria-hidden="true"></span>' : ""}<span class="stp-swatch" aria-hidden="true"></span><span class="stp-name"></span><span class="stp-count"></span>`;
        if (color)
          button.querySelector(".stp-swatch").style.setProperty("--stp-swatch-color", color);
        button.querySelector(".stp-name").textContent = value;
        button.querySelector(".stp-count").textContent = countText;
        if (isMulti) {
          const checked = selected.has(value.toLocaleLowerCase());
          const checkbox = button.querySelector(".stp-checkbox");
          checkbox.textContent = checked ? "✓" : "";
          checkbox.dataset.checked = String(checked);
          button.dataset.selected = String(checked);
        }
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          if (create || !multiMode)
            select(value);
          else
            toggleSelected(value);
        });
        list.appendChild(button);
      };
      if (allowCreate)
        addOption(query, "Create", true, 0);
      let index = allowCreate ? 1 : 0;
      const selectedCategory = categoryFilter ? categories.find((category) => category.id === categoryFilter) : undefined;
      const renderedGroups = selectedCategory ? [{ category: selectedCategory, tags: shownGroups.find((group) => group.category.id === selectedCategory.id)?.tags ?? [] }] : shownGroups;
      for (const group of renderedGroups) {
        const header = document.createElement("div");
        header.className = "stp-group-header";
        header.setAttribute("role", "presentation");
        const swatch = document.createElement("span");
        swatch.className = "stp-group-swatch";
        swatch.setAttribute("aria-hidden", "true");
        if (group.category.color)
          swatch.style.setProperty("--stp-swatch-color", group.category.color);
        const name = document.createElement("span");
        name.textContent = group.category.name;
        const count = document.createElement("span");
        count.className = "stp-group-count";
        count.textContent = String(group.tags.length);
        const create = document.createElement("button");
        create.type = "button";
        create.className = "stp-group-add";
        create.textContent = "+ New tag";
        create.setAttribute("aria-label", `Create and assign a new tag in ${group.category.name}`);
        create.addEventListener("mousedown", (event) => event.preventDefault());
        create.addEventListener("click", () => openCategoryCreator(group.category));
        header.append(swatch, name, count, create);
        list.appendChild(header);
        for (const item of group.tags) {
          addOption(item.tag, `${item.count} character${item.count === 1 ? "" : "s"}`, false, index, colorForTag(item.tag, group.category));
          index += 1;
        }
      }
      if (!visibleValues.length && !loading) {
        const empty = document.createElement("div");
        empty.className = "stp-empty";
        empty.textContent = query ? "No matching tags." : categoryFilter ? "No available tags in this category." : "No shared tags yet.";
        list.appendChild(empty);
      }
      multiBar.dataset.visible = String(multiMode);
      multiCount.textContent = `${selected.size} selected`;
      multiAddButton.disabled = selected.size === 0;
      multiCancelButton.disabled = selected.size === 0;
      updateActive();
    };
    multiToggle.addEventListener("click", () => {
      multiMode = !multiMode;
      multiToggle.dataset.active = String(multiMode);
      multiToggle.setAttribute("aria-pressed", String(multiMode));
      multiToggle.textContent = multiMode ? "Done" : "Select multiple";
      if (!multiMode)
        selected.clear();
      render();
    });
    multiCancelButton.addEventListener("click", () => {
      selected.clear();
      render();
    });
    multiAddButton.addEventListener("click", () => {
      applySelected();
    });
    const show = () => {
      setOpen(true);
      render();
      loadTags().then(render).catch((reason) => {
        status.textContent = "Could not load existing tags";
        list.replaceChildren();
        const error = document.createElement("div");
        error.className = "stp-error";
        error.textContent = reason instanceof Error ? reason.message : "Unknown error";
        list.appendChild(error);
      });
    };
    const onFocus = () => show();
    const onClick = () => {
      if (!open)
        show();
    };
    const onInput = () => {
      if (!open)
        setOpen(true);
      render();
    };
    const onKeyDown = (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!open)
          show();
        if (visibleValues.length) {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          active = active < 0 ? direction > 0 ? 0 : visibleValues.length - 1 : (active + direction + visibleValues.length) % visibleValues.length;
          updateActive();
        }
      } else if (event.key === "Enter" && open && active >= 0 && visibleValues[active]) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (multiMode && active !== createIndex)
          toggleSelected(visibleValues[active]);
        else
          select(visibleValues[active]);
      } else if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "Tab" && open)
        setOpen(false);
    };
    const onDocumentPointer = (event) => {
      const target = event.target;
      if (target instanceof Node && target !== input && !wrapper.contains(target))
        setOpen(false);
    };
    input.addEventListener("focus", onFocus);
    input.addEventListener("click", onClick);
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onDocumentPointer, true);
    const controller = { input, wrapper, render, destroy() {
      if (destroyed)
        return;
      destroyed = true;
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("click", onClick);
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onDocumentPointer, true);
      input.removeAttribute("role");
      input.removeAttribute("aria-autocomplete");
      input.removeAttribute("aria-controls");
      input.removeAttribute("aria-expanded");
      input.removeAttribute("aria-activedescendant");
      ctx.dom.uninject(wrapper);
      pickers.delete(input);
    } };
    pickers.set(input, controller);
    render();
  };
  const scan = () => {
    scanQueued = false;
    for (const [input, controller] of [...pickers])
      if (!input.isConnected || !controller.wrapper.isConnected)
        controller.destroy();
    if (library && (!library.root.isConnected || !library.wrapper.isConnected))
      library.destroy();
    for (const input of document.querySelectorAll('input[type="text"][placeholder]'))
      if (isTagInput(input))
        mountPicker(input);
    const drawer = document.querySelector('[data-spindle-drawer-tab="characters"]');
    const browser = drawer?.firstElementChild;
    if (drawer && browser) {
      const nativeTags = [...browser.children].find((child) => !child.hasAttribute("data-spindle-ext") && Boolean(child.querySelector(":scope > button svg.lucide-chevron-down")));
      if (nativeTags)
        mountLibrary(drawer, nativeTags);
    }
    renderCharacterCards();
  };
  const queueScan = () => {
    if (!scanQueued) {
      scanQueued = true;
      queueMicrotask(scan);
    }
  };
  const observer = new MutationObserver(queueScan);
  observer.observe(document.body, { childList: true, subtree: true });
  disposers.push(() => observer.disconnect());
  for (const event of ["CHARACTER_CREATED", "CHARACTER_EDITED", "CHARACTER_DELETED", "CHARACTER_DUPLICATED", "CHARACTER_LIBRARY_CHANGED", "CHAT_SWITCHED"])
    disposers.push(ctx.events.on(event, () => {
      if (suppressLibraryReload)
        return;
      lastLoaded = 0;
      Promise.all([loadTags(true), loadCharacters(true)]);
    }));
  Promise.all([readPreferences(), loadTags(), loadCharacters()]).then(() => {
    rerender();
    scan();
  }).catch(() => scan());
  scan();
  return () => {
    observer.disconnect();
    clearCardInjections();
    library?.destroy();
    for (const controller of [...pickers.values()])
      controller.destroy();
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch {}
    }
  };
}
export {
  setup
};
