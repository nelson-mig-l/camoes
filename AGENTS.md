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
# Train on data/corpus.txt, write model.json, print rhyme classes and one stanza
python markov_main.py
```

- Python 3.10+ is required (the code uses `X | None` syntax). The parent `.venv` has Python 3.14.
- Imports are flat module names (`from markov_model import ...`), so the script must run with this folder on `sys.path`.
  Running the file directly does that. Paths are anchored to `__file__`, so the working directory doesn't matter.
- There are no tests, linter or build config. `markov_data.load_text_corpus(text)` builds a corpus from a string, which
  is handy for quick checks without the corpus file.
- **Running `markov_main.py` overwrites the tracked `model.json` (~2.7 MB).** To experiment without touching it, copy
  the `.py` files and `data/` to a scratch folder and run there.

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

## Conventions

- Source files use CRLF line endings (`core.autocrlf=true`); keep them when editing.
- Identifiers and docstrings are in English, but some local variables and comments in `markov_train.py` are in
  Portuguese (`transicoes`, `finais_por_rima`). The corpus and rhyme strings are Portuguese.
- Known limitations (documented in `markov_main.py`): rhymes are approximate, syllable counting uses pyphen (accurate
  for modern Portuguese; archaic forms may be miscounted), and synaloepha/stress adjustments are heuristic.
  `docs/REVIEW.md` lists open improvement ideas.
- The final word is currently chosen uniformly (`finals_weights` is computed but unused, and the weighted line is
  commented out). Whether to weight it is undecided, so ask before changing it.
