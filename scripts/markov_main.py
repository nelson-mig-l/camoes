"""
Experimental generator of ottava rima stanzas inspired by *Os Lusíadas*.

Features:
- Corpus loading with preservation of line boundaries.
- Unicode normalization and punctuation cleanup.
- Inverse Markov model with frequency-weighted transitions.
- Approximate rhyme indexing based on the final stressed vowel.
- Generation of stanzas following the ABABABCC rhyme scheme.
- Alternative generation attempts and validation of rhyme classes.

Limitations:
- Identification of the stressed vowel is heuristic and does not replace a phonetic dictionary or a scansion tool for
  historical Portuguese.
- The model does not guarantee correct meter, perfect grammar, or semantic coherence.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Iterable

from markov_data import load_corpus_dir
from markov_generate import generate_stanza, RHYME_SCHEME
from markov_model import PoetryModel, save_model, load_model
from markov_train import train_model
from markov_utils import approximate_rhyme_key, count_metric_syllables

# Paths are anchored to this file so the script works from any working directory.
# scripts/ lives one level below the repo root.
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODEL_PATH = BASE_DIR / "model" / "model.json"


def get_final_rhyme(model: PoetryModel, rhyme: str) -> list[str]:
    """
    Finds final words whose approximate rhyme key matches the
    requested key. Does not silently fall back to weaker suffixes.
    """
    key = approximate_rhyme_key(rhyme)
    finals = model.finals_by_rhyme.get(key, Counter())
    return list(finals.keys())


def print_stanza(verses: Iterable[str], model: PoetryModel | None = None) -> None:
    for i, verse in enumerate(verses, start=1):
        if model is not None:
            words = re.findall(r"[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*", verse.lower())
            syl_map = {w: model.vocabulary[w]["syllables"] for w in words if w in model.vocabulary}
            n = count_metric_syllables(words, syl_map)
            print(f"{verse}  [{n}]")
        else:
            print(verse)


def show_available_rhymes(model: PoetryModel, limit: int | None = None) -> None:
    """Lists available rhyme keys to help with choosing A, B, and C. limit=None lists all."""
    if limit is not None and limit < 0:
        raise ValueError(f"limit must be None or >= 0, got {limit}.")
    keys = sorted(
        model.finals_by_rhyme.items(),
        key=lambda item: sum(item[1].values()),
        reverse=True,
    )
    print("Most frequent approximate rhyme classes:")
    for i, (key, final) in enumerate(keys[:limit], start=1):
        examples = ", ".join(list(final.keys())[:6])
        print(f"  {i} -> {key!r}: {examples}")

"""
Important limitations
- Rhyme verification is approximate. The code uses spelling-based heuristics to estimate the stressed vowel and rhyme
  ending. Portuguese diphthongs, stress exceptions, and historical pronunciation can cause incorrect matches.
- The stanza structure is enforced. The generator follows ABABABCC and rejects candidates whose estimated rhyme endings
  do not match.
- Meter is not implemented yet. The number of words is constrained, but ten-syllable decasyllabic meter is not
  guaranteed.
- Corpus quality matters. OCR errors, prose mixed with poetry, and incorrectly preserved line breaks will affect the
  results.
"""

if __name__ == "__main__":
    try:
        corpus = load_corpus_dir(DATA_DIR)
        model = train_model(corpus)
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        save_model(model, MODEL_PATH)
        model = load_model(MODEL_PATH)

        # print(f"Loaded verses: {len(model.training_verses)}")
        print(f"Unique words: {len(model.vocabulary)}")
        # show_available_rhymes(model)

        # Choose three rhyme classes that exist in the corpus.
        # Replace these endings with classes confirmed in the list above.
        stanza = generate_stanza(
            model,
            rhyme_a="ados",
            rhyme_b="al",
            rhyme_c="aram",
            target_syllables=10,
            tries_per_verse=30,
            tries_per_stanza=20,
        )

        print()
        if stanza:
            print(f"Generated stanza ({RHYME_SCHEME}):")
            print()
            # print_stanza(stanza, model)
            print_stanza(stanza)
            print()
        else:
            print("It was not possible to generate a stanza for the given rhymes.")

    except (FileNotFoundError, ValueError) as error:
        print(f"Error: {error}")
