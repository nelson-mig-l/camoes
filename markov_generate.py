import difflib
import random
import re
from collections import Counter

from markov_model import PoetryModel
from markov_utils import approximate_rhyme_key, count_metric_syllables


RHYME_SCHEME = "ABABABCC"


def weighted_choice(counters: Counter[str], rng: random.Random) -> str | None:
    """Choose an option with a probability proportional to its frequency."""
    if not counters:
        return None
    items = list(counters.keys())
    weights = list(counters.values())
    return rng.choices(items, weights=weights, k=1)[0]


def generate_inverse_stanza(
    model: PoetryModel,
    rhyme: str,
    target_syllables: int,
    rng: random.Random | None = None,
) -> str | None:
    """
    Generates a verse by starting from the final word and working backward through the model.

    The candidate verse is only accepted when its metric syllable count matches
    *target_syllables* exactly; otherwise None is returned so the caller can retry.

    Returns None if it cannot find an ending or an initial transition
    compatible with the model.
    """
    rng = rng or random.Random()
    rhyme_key = approximate_rhyme_key(rhyme)
    finals = model.finals_by_rhyme.get(rhyme_key)

    if not finals:
        return None

    # Try several endings of the same class, favoring the frequent ones.
    finals_candidates = list(finals.keys())
    finals_weights = list(finals.values())
    rng.shuffle(finals_candidates)

    #final = rng.choices(finals_candidates, weights=finals_weights, k=1)[0]
    final = rng.choices(finals_candidates)[0]
    pairs = model.starts_by_final.get(final)
    if not pairs:
        # The ending exists in the corpus, but it lacks sufficient context in the model.
        return None

    # Select an initial pair that has been observed.
    pair = rng.choice(pairs)
    verse_inverse = [pair[0], pair[1]]

    while True:
        key = (verse_inverse[-2], verse_inverse[-1])
        options = model.transitions.get(key)
        if not options:
            break
        next_word = weighted_choice(options, rng)
        if next_word is None:
            break
        verse_inverse.append(next_word)

    verse_words = list(reversed(verse_inverse))

    syl_map = {w: model.vocabulary[w]["syllables"] for w in verse_words if w in model.vocabulary}
    if count_metric_syllables(verse_words, syl_map) != target_syllables:
        return None

    return " ".join(verse_words).capitalize()


def ends_with_rhyme(verse: str, expected_key: str) -> bool:
    """expected_key must already be a rhyme key (output of approximate_rhyme_key)."""
    words = re.findall(r"[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*", verse.lower())
    if not words:
        return False
    return approximate_rhyme_key(words[-1]) == expected_key


def validate_rhyme(model: PoetryModel, rhyme: str) -> str:
    """Returns the rhyme key for `rhyme`, or raises ValueError if the corpus has no such class."""
    key = approximate_rhyme_key(rhyme)
    if not key:
        raise ValueError(f"Invalid rhyme {rhyme!r}: no letters left after normalization.")
    if key not in model.finals_by_rhyme:
        close = difflib.get_close_matches(key, list(model.finals_by_rhyme), n=5)
        hint = f" Did you mean: {', '.join(close)}?" if close else ""
        raise ValueError(f"Rhyme {rhyme!r} (key {key!r}) does not occur in the corpus.{hint}")
    return key


def generate_stanza(
    modelo: PoetryModel,
    rhyme_a: str,
    rhyme_b: str,
    rhyme_c: str,
    target_syllables: int,
    tries_per_verse: int = 30,
    tries_per_stanza: int = 20,
    seed: int | None = None,
) -> list[str] | None:
    """
    Generates a stanza (octave) following the rhyme scheme ABABABCC.

    Classes A, B, and C are approximated via an orthographic rhyme key.
    The function only accepts a line if it ends with the requested rhyme class
    and its metric syllable count matches *target_syllables* exactly.
    If it fails to construct the octave within the given constraints, it returns None.
    Raises ValueError for unknown rhyme classes or out-of-range parameters.
    """
    if tries_per_verse < 1 or tries_per_stanza < 1:
        raise ValueError(
            f"tries_per_verse and tries_per_stanza must be at least 1, "
            f"got {tries_per_verse} and {tries_per_stanza}."
        )

    rng = random.Random(seed)
    classes = {
        "A": rhyme_a,
        "B": rhyme_b,
        "C": rhyme_c,
    }
    keys = {letter: validate_rhyme(modelo, rhyme) for letter, rhyme in classes.items()}
    schema = list(RHYME_SCHEME)

    for _ in range(tries_per_stanza):
        stanza: list[str] = []
        failed = False

        for letter in schema:
            rhyme = classes[letter]
            key = keys[letter]
            accepted_verse = None

            for _ in range(tries_per_verse):
                candidate = generate_inverse_stanza(
                    modelo,
                    rhyme=rhyme,
                    target_syllables=target_syllables,
                    rng=rng,
                )
                if candidate and ends_with_rhyme(candidate, key):
                    accepted_verse = candidate
                    break

            if accepted_verse is None:
                failed = True
                break

            stanza.append(accepted_verse)

        if not failed and len(stanza) == 8:
            # Final verification of the schema, without relying solely on generation.
            valid = all(
                ends_with_rhyme(stanza[i], keys[letter])
                for i, letter in enumerate(schema)
            )
            if valid:
                return stanza

    return None
