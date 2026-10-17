# Code Review

Reviewed: 2026-10-17  
Scope: all Python source files in `scripts/`, `web/src/`, `web/index.html`, `web/vite.config.js`, `.github/workflows/deploy-pages.yml`, `AGENTS.md`, `README.md`.

---

## 1. Bugs

### B-1 · `scripts/markov_utils.py` · `count_syllables` — fallback is dead code

`_pyphen_dic.inserted(word)` returns the word unchanged (no hyphens) for monosyllabic words. The condition `if len(parts) > 1 or inserted:` is always true for any non-empty string, so the vowel-nucleus fallback is never reached.

**Fix:** Change to `if len(parts) > 1:`.

---

### B-2 · `scripts/markov_generate.py` · `generate_inverse_stanza` — shuffle before uniform choice is a no-op

```python
rng.shuffle(finals_candidates)
final = rng.choices(finals_candidates)[0]  # uniform, unweighted
```

`rng.choices` with no weights samples uniformly regardless of order. The shuffle consumes RNG state for no effect and misleads readers. Note that the JS side does shuffle before `rng.choice`, making the two sides consume RNG state differently for the same seed (see D-4).

**Fix:** Remove the `rng.shuffle(finals_candidates)` line.

---

### B-3 · `scripts/markov_model.py` · `load_model` — `split(" ")` should be `split(" ", 1)`

```python
tuple(key.split(" "))
```

A key with more than one space (e.g. caused by a cleaning bug producing a word with an internal space) would produce a tuple longer than 2. `split(" ", 1)` is both safer and self-documenting of the intent.

**Fix:** Change to `tuple(key.split(" ", 1))`.

---

### B-4 · `scripts/markov_data.py` · `load_text_corpus` — BOM not stripped

`load_corpus` opens files with `encoding="utf-8-sig"` which strips the BOM. `load_text_corpus` does not, so a string sourced from a file opened as plain `utf-8` would pass a BOM (`\ufeff`) into the first token.

**Fix:** Add `text = text.lstrip("\ufeff")` at the start of `load_text_corpus`.

---

### B-5 · `scripts/markov_generate.py` — triple `ends_with_rhyme` check

A verse is accepted only when `ends_with_rhyme(candidate, key)` is true (inner loop). The outer final-verification loop then checks the same condition again. The third check can never catch a failure the second did not, making it dead validation.

**Fix:** Either remove the inner check and rely on final validation, or remove the outer re-validation. If both are kept intentionally (defence in depth), add a comment explaining why.

---

### B-6 · `web/src/markov.js` · `makePRNG` — correlated seed expansion

The four state words are derived as `seed ^ constant`. States with seeds differing by one bit are highly correlated. A proper Splitmix32 expansion should be used:

```js
function splitmix32(x) {
  x = (x + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
let s0 = splitmix32(seed);
let s1 = splitmix32(s0);
let s2 = splitmix32(s1);
let s3 = splitmix32(s2);
```

---

## 2. Python ↔ JavaScript Divergences

### D-1 · `approximate_rhyme_key` — different traversal, same result

Python collects all accented vowel indices into a list and takes the last. JS scans backward and breaks on the first match. Both find the last accented vowel. No output divergence, but the implementations are harder to cross-check at a glance.

---

### D-4 · `generate_inverse_stanza` — shuffle is real in JS, no-op in Python

Python shuffles `finals_candidates` then does a uniform `rng.choices` (shuffle has no effect). JS shuffles then does `rng.choice` (shuffle is the mechanism of randomness). Both sides consume RNG state differently, so for a given integer seed, Python and JS produce different verse sequences. Cross-language reproducibility is not a stated goal, but the asymmetry is worth documenting.

---

### D-5 · OOV syllable counting (intentional)

For words not in `vocabulary`, Python uses pyphen (Hunspell-backed); JS counts raw vowel nuclei. Documented in AGENTS.md as intentional. For all corpus words both sides read the same pre-computed integer from `vocabulary`.

---

## 3. Correctness / Logic Issues

### C-1 · `scripts/markov_utils.py` + `web/src/markov.js` — `"om"` wrongly listed as paroxytone ⚠️

Words ending in `-om` (*bom*, *som*, *dom*, *com*) are **oxytone** in Portuguese, not paroxytone. They should receive a +1 metric syllable adjustment but the `paroxytone_endings` list causes them to receive 0. This produces a −1 error in the metric syllable count for any verse ending in such a word. The same error is present in the JS `finalStressAdjustment`.

**Fix:** Remove `"om"` from `paroxytone_endings` in both `_final_stress_adjustment` (Python) and `finalStressAdjustment` (JS).

---

### C-2 · `scripts/markov_train.py` — 2-word verses produce no learnable transitions

```python
for i in range(len(words) - 1, 1, -1):
```

For a 2-word verse `[w0, w1]`, the range is `range(1, 1, -1)` → empty. `finals_by_rhyme` stores `w1`, but no transition is stored, so `starts_by_final[w1]` will be empty and the word is effectively unlearnable as a verse-final word. Acceptable in practice but undocumented.

---

### C-3 · `scripts/markov_generate.py` + `web/src/markov.js` — no upper bound on the generation loop

```python
while True:
    ...
    verse_inverse.append(next_word)
```

No `max_words` guard. If the reverse-transition graph has a long cycle a single candidate can grow to hundreds of words before the syllable check rejects it, wasting time (and freezing the browser in JS).

**Fix:** Add `if len(verse_inverse) > 20: break` (or a configurable constant).

---

### C-4 · `scripts/markov_utils.py` · `approximate_rhyme_key` — hyphens survive word cleaning

The cleaning regex `[^a-záéíóúâêôàãõç-]` preserves hyphens. A word with a trailing hyphen (cleaning edge case) would retain it, and `word[start:]` could include it in the returned key.

---

### C-5 · `scripts/markov_main.py` — word regex duplicated instead of imported

The word regex `[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*` appears independently in `markov_data.py` (×2), `markov_generate.py`, and `markov_main.py`. See Q-4.

---

## 4. Robustness

### R-1 · `scripts/markov_main.py` — syllable counts not shown in CLI output ⚠️

```python
print_stanza(stanza)   # model=None → no syllable display
```

The `model` argument was commented out, silently disabling the `[10]` syllable count display. The feature appears to work but actually does nothing.

**Fix:** Change to `print_stanza(stanza, model)`.

---

### R-2 · `scripts/markov_generate.py` — A/B/C rhymes not checked for distinctness

`generate_stanza(model, "ados", "ados", "aram")` silently produces a stanza where A and B rhyme identically, which is wrong for ottava rima.

**Fix:** Add `if len({rhyme_a, rhyme_b, rhyme_c}) < 3: raise ValueError(...)` at the start of `generate_stanza`.

---

### R-3 · `web/src/main.js` — no `isNaN` check on retry count inputs

```js
const triesVerse  = parseInt(document.getElementById("tries-verse").value, 10);
const triesStanza = parseInt(document.getElementById("tries-stanza").value, 10);
```

Clearing either field produces `NaN`. `NaN < 1` is `false`, so `generateStanza` receives `NaN` and silently returns `null` instead of surfacing a validation error. Mirrors the `targetSyllables` check already present.

---

### R-4 · `web/src/markov.js` — no max iteration guard (mirrors C-3)

Same as C-3. In the browser a long cycle freezes the main thread indefinitely.

---

### R-5 · `scripts/markov_data.py` — pure-digit line filter has no comment

```python
if re.fullmatch(r"\d+\s*\.?", line):
    return ""
```

Intended to strip stanza numbers. Worth a comment clarifying that this is a corpus-specific heuristic, not a general rule.

---

### R-6 · `scripts/markov_model.py` — no schema version in `model.json`

Loading a stale `model.json` after a schema change silently produces `KeyError` exceptions or wrong results.

**Fix:** Add `"schema_version": 1` to the serialized JSON and assert it in `load_model`.

---

### R-7 · `web/src/main.js` — no retry after model load failure

If the fetch fails, the button is left permanently disabled with text "Erro ao carregar". The user must reload the page.

**Fix:** Add a retry button, or re-enable the generate button with an "Retry" label.

---

## 5. Performance

### P-1 · `scripts/markov_utils.py` — `print` inside `@lru_cache` function

The fallback branch (already dead — see B-1) prints to stdout. A side-effect inside a cached function is surprising. Use `logging.warning` or remove entirely once B-1 is fixed.

---

### P-2 · `web/src/markov.js` — syllable map rebuilt for already-accepted verses

`generateStanza` recomputes metric syllable counts for display after generation. Since `generateInverseStanza` already verified the count equals `targetSyllables`, the recomputed value is always `targetSyllables`. The rebuild is unnecessary.

**Fix:** Return `{ verse, syllableCount: targetSyllables }` from `generateInverseStanza` directly.

---

### P-3 · `scripts/markov_train.py` — unnecessary dict copy

```python
return PoetryModel(
    transitions=dict(transitions),   # defaultdict is already a dict subclass
    ...
)
```

`dict(transitions)` copies a potentially large mapping. Pass `transitions` directly.

---

## 6. Code Quality

### Q-1 · `scripts/markov_main.py` — commented-out code and misplaced doc block

Several lines are commented out (`show_available_rhymes`, `print_stanza(stanza, model)`, `training_verses`). The "Important limitations" block sits after the function definitions in the module body rather than as a module docstring. Should be the module docstring at the top of the file.

---

### Q-2 · `scripts/markov_generate.py` — `modelo` vs `model` naming

`generate_stanza` uses `modelo` (Portuguese) while every other function in the codebase uses `model`. Should be renamed to `model` for consistency.

---

### Q-3 · `scripts/markov_utils.py` — `VOWELS` string used for membership tests

```python
if words[i][-1] in VOWELS and words[i + 1][0] in VOWELS:
```

`in` on a string is O(n). A module-level `VOWELS_SET = frozenset(VOWELS)` would match the JS side (`VOWELS_SET`) and make intent explicit.

---

### Q-4 · Word regex duplicated across 4+ files ⚠️

`[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*` appears independently in:

- `markov_data.py` (×2)
- `markov_generate.py`
- `markov_main.py`

**Fix:** Define `WORD_RE = re.compile(r"[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*")` as a module-level constant in `markov_utils.py` and import it everywhere.

---

### Q-5 · `scripts/markov_model.py` — dataclass `__eq__` includes `starts_by_final`

The default dataclass `eq=True` generates `__eq__` over all fields including `starts_by_final` (which is `init=False`). Two `PoetryModel` instances loaded from the same file would compare equal only because their derived index matches — but the intent is likely to compare by serializable fields only.

---

### Q-6 · `web/package.json` — `name` is `"src"`

Leftover from the Vite scaffold. Should be `"camoes-web"` or similar.

---

### Q-7 · `scripts/markov_main.py` — `get_final_rhyme` is dead code

Defined but never called anywhere. Remove it or move it to a utilities module if it has future use.

---

## 7. Web / UX

### W-1 · `web/index.html` — no `<meta name="description">`

Link previews and search results will have no description. Add a `<meta name="description">` and optionally Open Graph tags.

---

### W-2 · `web/src/main.js` — no accessible feedback for fill-rhyme action

When a rhyme chip is clicked, the selected input is filled silently. Screen reader users receive no feedback about which input was filled or which slot is currently active.

**Fix:** Add an `aria-live="polite"` region that announces e.g. "Rima A preenchida com 'ados'".

---

### W-3 · `web/src/main.js` — `scrollIntoView` ignores `prefers-reduced-motion`

```js
outputSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
```

**Fix:**
```js
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
outputSection.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "nearest" });
```

---

### W-4 · `web/src/style.css` — `outline: none` on `:focus` fails WCAG 2.4.7 ⚠️

```css
.rhyme-chip:hover,
.rhyme-chip:focus {
  outline: none;
}
```

This removes the keyboard focus indicator for all users, failing WCAG 2.1 §2.4.7 (Focus Visible).

**Fix:** Change `:focus` to `:focus-visible`. This preserves the focus ring for keyboard users while suppressing it on mouse click.

---

### W-5 · `web/index.html` — `<section>` elements lack `aria-labelledby`

The three `<section>` elements have `<h2>` children but no explicit `aria-labelledby` linking them, reducing landmark navigation clarity for screen reader users.

---

### W-6 · `web/index.html` — error box lacks `role="alert"` ⚠️

`#error-box` is shown by toggling `hidden` and setting `textContent`. Without `role="alert"`, screen readers won't announce errors when they appear.

**Fix:** Add `role="alert"` to `<div id="error-box">` in the HTML.

---

### W-7 · `web/src/main.js` — generation blocks the main thread ⚠️

`requestAnimationFrame` + `setTimeout(0)` yields only one paint frame before locking the tab. With high retry counts (e.g. 200×200) this can freeze the browser for several seconds.

**Fix:** Move generation to a Web Worker, or use chunked async generation with `setTimeout` between stanza attempts.

---

### W-8 · `web/src/style.css` — rhymes list `max-height` is not responsive

```css
.rhymes-list {
  max-height: 340px;
}
```

On narrow viewports this is a disproportionate fraction of the screen. Use `max-height: min(340px, 40vh)` or a media query.

---

## 8. Docs / AGENTS.md

### DOC-1 · AGENTS.md — `__post_init__` guidance is ambiguous

> "Add any new derived index the same way, so that both `train_model` and `load_model` get it."

Should explicitly say: add derived fields with `field(init=False, repr=False)` and compute them in `__post_init__`, which is called automatically by `PoetryModel(...)` in both `train_model` and `load_model`.

---

### DOC-3 · AGENTS.md — no-`max_words` gap not flagged

The architecture section describes the generation loop but does not note that the loop has no word count upper bound (see C-3/R-4). Should be listed as a known gap.

---

### DOC-4 · `README.md` — usage command is wrong and mentions a disabled feature ⚠️

The README says:
```sh
python markov_main.py
```
The correct command is:
```sh
python scripts/markov_main.py
```
It also states the command "prints available rhyme classes", but `show_available_rhymes` is commented out in `markov_main.py`.

---

### DOC-5 · AGENTS.md — model file size will become stale

`(~2.7 MB)` is a point-in-time snapshot. Any retraining on an enlarged corpus invalidates it.

---

### DOC-6 · AGENTS.md — `"om"` metric error not in Known Limitations

The Known Limitations section mentions rhyme approximation and pyphen accuracy but not the `-om` oxytone misclassification (see C-1), which affects common words in *Os Lusíadas* (*bom*, *dom*, *som*).

---

## Summary

| ID | Severity | Category | Location | Issue |
|----|----------|----------|----------|-------|
| B-1 | Medium | Bug | `markov_utils.py` | `count_syllables` fallback dead code |
| B-2 | Low | Bug | `markov_generate.py` | shuffle before uniform choice is no-op |
| B-3 | Low | Bug | `markov_model.py` | `split(" ")` should be `split(" ", 1)` |
| B-4 | Low | Bug | `markov_data.py` | BOM not stripped in `load_text_corpus` |
| B-5 | Low | Bug | `markov_generate.py` | triple `ends_with_rhyme` — dead validation |
| B-6 | Medium | Bug | `markov.js` | PRNG seed expansion produces correlated states |
| D-4 | Low | Divergence | `markov_generate.py` / `markov.js` | Python shuffle is no-op; JS shuffle is real |
| D-5 | Info | Divergence | — | OOV syllable counting differs (intentional) |
| C-1 | **High** | Correctness | `markov_utils.py` + `markov.js` | `"om"` wrongly listed as paroxytone |
| C-2 | Low | Correctness | `markov_train.py` | 2-word verses generate no transitions |
| C-3 | Medium | Correctness | `markov_generate.py` | no upper bound on generation loop |
| C-4 | Low | Correctness | `markov_utils.py` | hyphens survive `approximate_rhyme_key` cleaning |
| R-1 | **High** | Robustness | `markov_main.py` | syllable counts not shown in CLI output |
| R-2 | Medium | Robustness | `markov_generate.py` | A/B/C rhymes not checked for distinctness |
| R-3 | Medium | Robustness | `main.js` | no `isNaN` on retry count inputs |
| R-4 | Medium | Robustness | `markov.js` | no max iteration guard on generation loop |
| R-5 | Low | Robustness | `markov_data.py` | pure-digit filter has no comment |
| R-6 | Medium | Robustness | `markov_model.py` | no schema version in `model.json` |
| R-7 | Low | Robustness | `main.js` | no retry after model load failure |
| P-1 | Low | Performance | `markov_utils.py` | `print` side-effect inside `@lru_cache` |
| P-2 | Low | Performance | `markov.js` | syllable map rebuilt for accepted verses |
| P-3 | Low | Performance | `markov_train.py` | unnecessary dict copy |
| Q-1 | Low | Quality | `markov_main.py` | commented-out code and misplaced doc block |
| Q-2 | Low | Quality | `markov_generate.py` | `modelo` vs `model` naming |
| Q-3 | Low | Quality | `markov_utils.py` | `VOWELS` string used for membership test |
| Q-4 | Medium | Quality | multiple | word regex duplicated across 4+ files |
| Q-5 | Low | Quality | `markov_model.py` | dataclass `__eq__` includes derived field |
| Q-6 | Low | Quality | `package.json` | `name` field is `"src"` |
| Q-7 | Low | Quality | `markov_main.py` | `get_final_rhyme` is dead code |
| W-1 | Low | Web/UX | `index.html` | no `<meta name="description">` |
| W-2 | Medium | Web/UX | `main.js` | no `aria-live` feedback for fill-rhyme |
| W-3 | Low | Web/UX | `main.js` | `scrollIntoView` ignores `prefers-reduced-motion` |
| W-4 | Medium | Web/UX | `style.css` | `outline: none` on `:focus` fails WCAG 2.4.7 |
| W-5 | Low | Web/UX | `index.html` | sections lack `aria-labelledby` |
| W-6 | Medium | Web/UX | `index.html` | error box lacks `role="alert"` |
| W-7 | **High** | Web/UX | `main.js` | generation blocks main thread |
| W-8 | Low | Web/UX | `style.css` | rhymes list `max-height` not responsive |
| DOC-1 | Low | Docs | `AGENTS.md` | `__post_init__` guidance ambiguous |
| DOC-3 | Low | Docs | `AGENTS.md` | no-`max_words` gap not documented |
| DOC-4 | Medium | Docs | `README.md` | wrong usage command; disabled feature mentioned |
| DOC-5 | Low | Docs | `AGENTS.md` | model file size note will become stale |
| DOC-6 | Medium | Docs | `AGENTS.md` | `"om"` metric error missing from Known Limitations |
