import re
from pathlib import Path

from markov_utils import normalize_unicode



def clean_line(line: str) -> str:
    """
    Cleans a line while preserving accented letters, apostrophes, and hyphens.
    Removes common stanza markers and peripheral punctuation.
    """
    line = normalize_unicode(line).lower().strip()

    # Remove standalone stanza numbering, for example "12" or "12."
    if re.fullmatch(r"\d+\s*\.?", line):
        return ""

    # Removes external punctuation, but preserves internal hyphens/apostrophes.
    line = re.sub(r"[«»“”\"()\[\]{}]", " ", line)
    line = re.sub(r"[.,;:!?…]", " ", line)
    line = re.sub(r"[—–]", " ", line)
    line = re.sub(r"\s+", " ", line).strip()

    return line


def load_corpus(path: str | Path) -> list[list[str]]:

    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(
            f"Corpus file not found: {path.resolve()}"
        )

    verses: list[list[str]] = []
    with path.open("r", encoding="utf-8-sig") as file:
        for line in file:
            original = normalize_unicode(line).strip()
            if not original:
                continue

            clean = clean_line(original)
            words = re.findall(r"[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*", clean)

            # It ignores very short lines, which tend to be OCR noise.
            if len(words) >= 2:
                verses.append(words)

    if not verses:
        raise ValueError(
            "The corpus contains no usable lines. Check the file and the encoding."
        )
    return verses


def load_text_corpus(text: str) -> list[list[str]]:
    """Useful version for small tests without a file."""
    verses: list[list[str]] = []
    for line in normalize_unicode(text).splitlines():
        original = line.strip()
        if not original:
            continue
        clean = clean_line(original)
        words = re.findall(r"[a-záéíóúâêôàãõç]+(?:['-][a-záéíóúâêôàãõç]+)*", clean)
        if len(words) >= 2:
            verses.append(words)
    return verses


