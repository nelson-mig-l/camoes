from collections import Counter, defaultdict

from markov_model import PoetryModel
from markov_utils import approximate_rhyme_key, count_syllables


def train_model(verses: list[list[str]]) -> PoetryModel:
    """
    Train the model in reverse.

    For the sequence "... a b c", store:
    ("c", "b") -> "a"
    ("b", "a") -> the word preceding "a", if it exists.

    The counts allow for the selection of transitions in proportion to
    their observed frequency in the corpus.

    vocabulary stores {count, syllables} per word, where count is the
    corpus frequency and syllables is the pyphen-computed syllable count.
    """
    transitions: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    ends_by_rhyme: dict[str, Counter[str]] = defaultdict(Counter)
    word_freq: Counter[str] = Counter()

    valid_verses: list[list[str]] = []

    for words in verses:
        words = [p.lower() for p in words if p.strip()]
        if len(words) < 2:
            continue

        valid_verses.append(words)
        word_freq.update(words)

        final = words[-1]
        key = approximate_rhyme_key(final)
        if key:
            ends_by_rhyme[key][final] += 1

        # The model is trained from end to begin.
        for i in range(len(words) - 1, 1, -1):
            actual = words[i]
            previous = words[i - 1]
            ancestor = words[i - 2]
            transitions[(actual, previous)][ancestor] += 1

    # Build vocabulary: {word: {"count": freq, "syllables": n}}
    vocabulary: dict[str, dict] = {
        word: {"count": freq, "syllables": count_syllables(word)}
        for word, freq in word_freq.items()
    }

    return PoetryModel(
        transitions=dict(transitions),
        finals_by_rhyme=dict(ends_by_rhyme),
        vocabulary=vocabulary,
    )
