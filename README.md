# Camões

An experimental generator of *ottava rima* stanzas (rhyme scheme ABABABCC) in the style of Camões' *Os Lusíadas*.

## How it works

The generator uses a word-level Markov model trained on the corpus of *Os Lusíadas*. Generation runs **backwards**: it starts from a rhyming final word and walks toward the beginning of the verse, then reverses the result. This approach makes it straightforward to enforce end-rhyme without post-filtering.

Each generated stanza follows the ABABABCC scheme. Verses are filtered to exactly 10 metric syllables, counted using pyphen's Portuguese hyphenation dictionary with synaloepha and final-word stress adjustments applied.

## Setup

Python 3.10+ is required.

```sh
pip install -r requirements.txt
```

## Usage

```sh
python markov_main.py
```

This trains the model on `data/corpus.txt`, writes `model.json`, prints available rhyme classes, and generates one stanza. The rhyme classes (A, B, C) are set in `markov_main.py` — pick three from the printed list.

Example output:

```
Em diversos ofícios ocupados  [10]
Da desejada parte oriental  [10]
Apousentos de febo limitados  [10]
Que desejada já da real  [10]
Em meu reino sereis agasalhados  [10]
O miralmomini em portugal  [10]
Trabalhos nunca usados me inventaram  [10]
Trabalhos nunca usados me inventaram  [10]
```

The number in brackets is the metric syllable count. All verses are filtered to match the target (default: 10).

## Architecture

```
markov_data     load + clean corpus lines
markov_train    count reverse transitions, build vocabulary with syllable counts
markov_model    PoetryModel dataclass + JSON serialisation
markov_generate sample verses, enforce rhyme and syllable count
markov_main     CLI glue
markov_utils    shared helpers: rhyme key, syllable counting, metric counting
```

Key design decisions:

- **Reverse Markov model.** Training stores `(w[i], w[i-1]) → w[i-2]` counts, so generation anchors on the final rhyming word and extends leftward.
- **Syllable counts in the vocabulary.** Each entry in `vocabulary` is `{"count": int, "syllables": int}`. Counts are computed once at training time via pyphen (`pt_PT` dictionary) and looked up at generation time — no re-computation per candidate.
- **Metric syllable counting.** `count_metric_syllables()` sums per-word counts, subtracts one per synaloepha (vowel-final word followed by vowel-initial word), and adds ±1 for oxytone/proparoxytone line endings.
- **Approximate rhyme keys.** `approximate_rhyme_key()` extracts the suffix from the last stressed vowel using orthographic heuristics. Both training and generation use the same function.

## Limitations

- Rhyme matching is orthographic, not phonetic — diphthongs, stress exceptions, and archaic forms can cause false matches or misses.
- Syllable counting via pyphen is accurate for modern Portuguese; archaic forms in *Os Lusíadas* may be miscounted.
- Synaloepha and stress adjustments are heuristic. Hiatus is not detected.
- The model has no notion of syntax, grammar, or meaning.
