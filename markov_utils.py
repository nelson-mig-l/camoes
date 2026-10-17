import re
import unicodedata
from functools import lru_cache

VOWELS = "aeiouáéíóúâêôà"


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