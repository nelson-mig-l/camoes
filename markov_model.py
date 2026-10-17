import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class PoetryModel:
    transitions: dict[tuple[str, str], Counter[str]]
    finals_by_rhyme: dict[str, Counter[str]]
    # word -> {"count": int, "syllables": int}
    vocabulary: dict[str, dict]
    # Index derived from transitions: final word -> observed pairs starting with it.
    # Built once so generation does not scan every transition for each candidate verse.
    starts_by_final: dict[str, list[tuple[str, str]]] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        index: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for pair, options in self.transitions.items():
            if options:
                index[pair[0]].append(pair)
        self.starts_by_final = dict(index)


def save_model(model: PoetryModel, filename: str | Path) -> None:
    data = {
        # JSON keys must be strings: join the word pair with a space (words never contain spaces)
        "transitions": {
            " ".join(key): dict(counter)
            for key, counter in model.transitions.items()
        },
        "finals_by_rhyme": {
            key: dict(counter)
            for key, counter in model.finals_by_rhyme.items()
        },
        # vocabulary: {word: {"count": int, "syllables": int}}
        "vocabulary": model.vocabulary,
    }

    with Path(filename).open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_model(filename: str | Path) -> PoetryModel:
    with Path(filename).open("r", encoding="utf-8") as f:
        data = json.load(f)

    return PoetryModel(
        transitions={
            tuple(key.split(" ")): Counter(counter)
            for key, counter in data["transitions"].items()
        },
        finals_by_rhyme={
            key: Counter(counter)
            for key, counter in data["finals_by_rhyme"].items()
        },
        vocabulary=data["vocabulary"],
    )
