import re
import unicodedata
from functools import lru_cache

import pyphen

VOWELS = "aeiouáéíóúâêôàãõ"

# Module-level pyphen dictionary for pt_PT.  Initialised once to avoid
# repeated disk access; shared across all callers.
_pyphen_dic = pyphen.Pyphen(lang="pt_PT")


@lru_cache(maxsize=65536)
def count_syllables(word: str) -> int:
    """
    Returns the number of syllables in *word* using the pyphen pt_PT dictionary.

    Falls back to counting vowel nuclei when pyphen produces no split
    (e.g. single-letter words or unexpected edge cases).
    """
    word = normalize_unicode(word.lower())
    inserted = _pyphen_dic.inserted(word)
    parts = inserted.split("-")
    if len(parts) > 1 or inserted:
        return max(1, len(parts))
    # Fallback: count vowel nuclei (adjacent vowels count as one nucleus).
    print(f"Failed to count syllables for {word}. Using fallback...")
    nuclei = len(re.findall(f"[{re.escape(VOWELS)}]+", word))
    return max(1, nuclei)


def count_metric_syllables(
    words: list[str],
    syllables_map: dict[str, int],
) -> int:
    """
    Counts metric (poetic) syllables for a sequence of words.

    Rules applied (classical Portuguese decasyllabic verse):
    1. Base count: sum of per-word syllable counts from *syllables_map*
       (falls back to count_syllables() for unknown words).
    2. Synaloepha: when word i ends in a vowel and word i+1 starts in a
       vowel, subtract 1 (the two syllables merge in pronunciation).
    3. Final-word stress adjustment:
       - Oxytone ending (last stressed syllable is the final one): add 1.
         Detected orthographically: word ends in a consonant that is not
         -m/-s/-ns/-em/-ens, or bears an acute/circumflex accent on the
         last vowel.
       - Proparoxytone ending (stress on the antepenultimate syllable):
         subtract 1.  Detected by a written accent two or more syllables
         from the end (rare in *Os Lusíadas*).
    """
    if not words:
        return 0

    total = sum(syllables_map.get(w, count_syllables(w)) for w in words)

    # Synaloepha: subtract 1 for each vowel-to-vowel word boundary.
    for i in range(len(words) - 1):
        if words[i][-1] in VOWELS and words[i + 1][0] in VOWELS:
            total -= 1

    # Final-word stress adjustment.
    last = normalize_unicode(words[-1].lower())
    last_clean = re.sub(r"[^a-záéíóúâêôàãõç]", "", last)
    if last_clean:
        total += _final_stress_adjustment(last_clean)

    return total


def _final_stress_adjustment(word: str) -> int:
    """
    Returns +1 for oxytone, -1 for proparoxytone, 0 for paroxytone.

    Paroxytone is the baseline for the classical decasyllabic line:
    - verse ends on the 10th metric syllable, which is the stressed one.
    For an oxytone ending there is no unstressed syllable after the
    stress, so the syllable count is one short of paroxytone; add 1.
    For a proparoxytone there is an extra unstressed syllable; subtract 1.
    """
    # Explicit accent on the last vowel → oxytone.
    last_vowel_idx = max(
        (i for i, ch in enumerate(word) if ch in VOWELS),
        default=None,
    )
    if last_vowel_idx is None:
        return 0

    last_vowel = word[last_vowel_idx]
    tail = word[last_vowel_idx:]

    # Acute or circumflex on the very last vowel nucleus → oxytone.
    if last_vowel in "áéíóúâêô":
        return +1

    # Words ending in typical paroxytone patterns: vowel, -s, -m, -ns,
    # -em, -ens, -am, -ão, -ões, -ram.
    paroxytone_endings = (
        "a", "e", "o", "i", "u",
        "as", "es", "os", "is", "us",
        "am", "em", "om",
        "ns", "ens",
        "ão", "ões", "ram",
    )
    if word.endswith(paroxytone_endings):
        # Check for proparoxytone: explicit accent two+ syllables from end.
        # These bear a written accent on a non-final vowel nucleus.
        accentuated = [i for i, ch in enumerate(word) if ch in "áéíóúâêô"]
        if accentuated and accentuated[-1] < last_vowel_idx:
            return -1
        return 0

    # Ends in a consonant other than the paroxytone set → oxytone.
    return +1


def normalize_unicode(text: str) -> str:
    return unicodedata.normalize("NFC", text)


@lru_cache(maxsize=65536)
def approximate_rhyme_key(word: str) -> str:
    """
    Estimates the orthographic rhyme ending.

    Heuristic:
    - identifies the last written vowel;
    - if the word has an acute or circumflex accent, it uses the last
    accented vowel as an approximation of the stressed vowel;
    - otherwise, it uses the last vowel, which is merely an approximation
    (it does not correctly account for all Portuguese accentuation rules).

    To reduce false rhymes, it does not remove the accents.
    """
    word = normalize_unicode(word.lower())
    word = re.sub(r"[^a-záéíóúâêôàãõç-]", "", word)
    if not word:
        return ""

    # First try to use the last explicitly accented vowel.
    accentuated_index = [
        i for i, ch in enumerate(word)
        if ch in "áéíóúâêô"
    ]
    if accentuated_index:
        return word[accentuated_index[-1]:]

    # Heuristic for words without a written accent:
    # In many words ending in a vowel, -s, -m, or -ns, the stressed
    # syllable is the penultimate one. We approximate this position by using
    # the last two vowel nuclei. This approach is intentionally simple and may
    # fail in cases involving hiatuses, diphthongs, or verb forms; it is not
    # a complete phonetic analysis.
    vowel_index = [i for i, ch in enumerate(word) if ch in VOWELS]
    if not vowel_index:
        return word[-3:] if len(word) >= 3 else word

    ends_with_stress_on_penultimate_syllable = (
        word.endswith(("a", "e", "o", "as", "es", "os", "am", "em", "ens", "ão", "ões", "ram"))
    )

    if ends_with_stress_on_penultimate_syllable and len(vowel_index) >= 2:
        start = vowel_index[-2]
    else:
        start = vowel_index[-1]

    return word[start:]