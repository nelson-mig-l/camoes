# CLAUDE.md

This file provides guidance to AI agents when working with code in this repository.

## What this is

An experimental generator of *ottava rima* stanzas (rhyme scheme ABABABCC) in the style of Camões' *Os Lusíadas*. It
uses a word-level Markov model that is trained and sampled **backwards**: generation starts from a rhyming final word
and walks toward the start of the verse.

## Dependencies

```sh
pip install -r requirements.txt
```

- **pyphen==0.18.1** — hyphenation library backed by Hunspell/LibreOffice dictionaries. Used to count syllables per
  word at training time via `markov_utils.count_syllables()`. The `pt_PT` dictionary is loaded once at module import.

## Commands

```sh
# Train on data/, write model/model.json, print rhyme classes and one stanza
python scripts/markov_main.py
```

- Python 3.10+ is required (the code uses `X | None` syntax). The parent `.venv` has Python 3.14.
- Imports are flat module names (`from markov_model import ...`), so the script must run with `scripts/` on `sys.path`.
  Running the file directly does that. Paths are anchored to `__file__`, so the working directory doesn't matter.
- There are no tests, linter or build config. `markov_data.load_text_corpus(text)` builds a corpus from a string, which
  is handy for quick checks without the corpus file.
- **Running `markov_main.py` overwrites the tracked `model/model.json` (~2.7 MB).** To experiment without touching it, copy
  the `scripts/` and `data/` to a scratch folder and run there.

## Architecture

Pipeline: `markov_data` (load + clean) → `markov_train` (count) → `markov_model` (dataclass + JSON) →
`markov_generate` (sample) → `markov_main` (CLI glue).

- **Reverse transitions.** For a verse `w0 … wn`, training stores `(w[i], w[i-1]) → w[i-2]` counts. Generation picks a
  final word for the rhyme class, picks an observed pair that starts with it, then extends with frequency-weighted
  choices until `max_words` or a dead end, and finally reverses the list.
- **Rhyme keys** (`markov_utils.approximate_rhyme_key`) are an orthographic heuristic: the suffix from the last accented
  vowel, or from the second-to-last vowel for endings that are usually stressed on the penultimate syllable. The
  function is `lru_cache`d and used by both training and generation. Changing it changes the rhyme classes, so retrain
  afterwards.
- **`PoetryModel`** holds `transitions`, `finals_by_rhyme` and `vocabulary`. `starts_by_final` is a derived index built
  in `__post_init__` and is **not** serialized. Add any new derived index the same way, so that both `train_model` and
  `load_model` get it. In JSON, the transition key pairs are joined with a space.
- **`vocabulary` schema:** `dict[str, dict]` mapping each word to `{"count": int, "syllables": int}`. `count` is the
  corpus frequency; `syllables` is computed at training time via `count_syllables()` (pyphen). If you change the
  vocabulary schema, **retrain the model** — the old `model.json` will not be compatible.
- **Syllable enforcement:** `generate_stanza` accepts a `target_syllables` parameter (default `10`). Each candidate
  verse is scored with `count_metric_syllables()`, which sums per-word syllable counts from the vocabulary, subtracts
  one for each synaloepha (vowel-ending word followed by vowel-starting word), and applies a final-word stress
  adjustment (+1 oxytone, −1 proparoxytone). Pass `target_syllables=None` to disable the filter.
- **Stanza generation** (`generate_stanza`) checks its inputs first (unknown rhyme → `ValueError` with close-match
  hints). It retries each verse `tries_per_verse` times and the whole octave `tries_per_stanza` times, then re-checks
  the full scheme. It returns `None` on failure. Pass `seed` for reproducible output.
- **Text cleaning:** NFC normalization, lowercasing, stripping of stanza-number lines and outer punctuation. Internal
  `'`/`-` are kept, and lines with fewer than 2 words are dropped. The word regex `[a-záéíóúâêôàãõç]+(?:['-][...]+)*` is
  repeated in `markov_data.py` and `markov_generate.py`; keep the two in sync.

## Web interface

A Vite (vanilla JS) page lives in `web/`. It loads `model.json` at runtime via `fetch` and reimplements the full
generation pipeline in `web/src/markov.js`.

```sh
cd web
npm install
npm run dev       # dev server
npm run build     # production build → web/dist/
```

`web/public/model.json` is a copy of `model/model.json`. After retraining, copy the file:

```sh
cp model/model.json web/public/model.json
```

`web/vite.config.js` sets `base: "/camoes/"` (via the `VITE_BASE` env var, defaulting to `/camoes/`) so that all
asset URLs are correct when served from GitHub Pages. If the repository is ever renamed or served from a custom domain
at the root, set `VITE_BASE=/` in the workflow env or update the default in `vite.config.js`.

The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) builds `web/` and deploys `web/dist/` to GitHub
Pages on every push to `main` that touches `web/**` or the workflow file itself. The page is served at
`https://nelson-mig-l.github.io/camoes/`. GitHub Pages source must be set to **"GitHub Actions"** in repo Settings →
Pages before the first deploy.

### Python ↔ JavaScript sync contract

`web/src/markov.js` is a manual port of three Python modules. The table below lists every piece that must be kept in
sync. When you change the Python side, apply the matching change to the JS side and vice versa.

| Concern | Python | JavaScript |
|---|---|---|
| **model.json schema** | `markov_model.py` `save_model` / `load_model` | `loadModel()` in `markov.js` |
| **Transition key format** | `" ".join(pair)` (space-joined word pair) | `key.indexOf(" ")` split in `loadModel` and generation loop |
| **`starts_by_final` index** | `PoetryModel.__post_init__` — maps `pair[0]` → list of pairs | same logic in `loadModel`: iterates transition keys, groups by first token |
| **`vocabulary` schema** | `{"count": int, "syllables": int}` per word | `model.vocabulary[w].syllables` — must match key names exactly |
| **Rhyme key heuristic** | `markov_utils.approximate_rhyme_key` | `approximateRhymeKey()` in `markov.js` |
| **Metric syllable counting** | `markov_utils.count_metric_syllables` + `_final_stress_adjustment` | `countMetricSyllables()` + `finalStressAdjustment()` in `markov.js` |
| **Synaloepha rule** | last char of word *i* in `VOWELS` and first char of word *i+1* in `VOWELS` → subtract 1 | same check using `VOWELS_SET` |
| **Oxytone / proparoxytone lists** | `paroxytone_endings` tuple in `_final_stress_adjustment` | `paroxytoneEndings` array in `finalStressAdjustment()` — must be identical |
| **Word regex** | `[a-záéíóúâêôàãõç]+(?:['-][...]+)*` in `markov_data.py` and `markov_generate.py` | `WORD_RE` in `markov.js` — same character class |
| **Final-word selection** | uniform (`rng.choices(finals_candidates)`, weighted line commented out) | uniform (`rng.choice(finalCandidates)`) — do not change one without changing the other |
| **Generation loop** | `generate_inverse_stanza` + `generate_stanza` in `markov_generate.py` | `generateInverseStanza()` + `generateStanza()` in `markov.js` |
| **RHYME_SCHEME** | `"ABABABCC"` constant in `markov_generate.py` | `RHYME_SCHEME` export in `markov.js` |

**Syllable counting divergence (intentional).** The Python fallback uses pyphen (Hunspell). The JS fallback uses vowel
nucleus counting. This only affects out-of-vocabulary words; for all words present in `vocabulary` both sides read the
same pre-computed integer, so results are identical for known corpus words.

**If you change `model.json`'s schema** (e.g. add a field, rename a key, change the transition key separator):
1. Update `save_model` / `load_model` in `markov_model.py`.
2. Update `loadModel()` in `web/src/markov.js`.
3. Retrain (`python scripts/markov_main.py`) to regenerate `model/model.json`.
4. Copy the new file: `cp model/model.json web/public/model.json`.

## Conventions

- Source files use CRLF line endings (`core.autocrlf=true`); keep them when editing.
- Identifiers and docstrings are in English, but some local variables and comments in `markov_train.py` are in
  Portuguese (`transicoes`, `finais_por_rima`). The corpus and rhyme strings are Portuguese.
- Known limitations (documented in `markov_main.py`): rhymes are approximate, syllable counting uses pyphen (accurate
  for modern Portuguese; archaic forms may be miscounted), and synaloepha/stress adjustments are heuristic.
  `docs/REVIEW.md` lists open improvement ideas.
- The final word is currently chosen uniformly (`finals_weights` is computed but unused, and the weighted line is
  commented out). Whether to weight it is undecided, so ask before changing it.
