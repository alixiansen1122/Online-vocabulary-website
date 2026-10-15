"""Audit the book's synonym links with WordNet and keep Chinese explanations.

The generated JSON is committed, so the website does not depend on Python or NLTK.
Only terms in the book are added automatically; reviewed external terms are listed
explicitly below and must already have a Chinese entry in synonym-details.json.
"""

import json
import re
from pathlib import Path

from nltk.corpus import wordnet as wn


ROOT = Path(__file__).resolve().parents[1]
BOOK_PATH = ROOT / "src" / "data" / "bbdc-yszch.json"
DETAILS_PATH = ROOT / "src" / "data" / "synonym-details.json"

AUDITED_OVERRIDES = {
    "atmosphere": ["air", "ambiance", "ambience", "mood", "aura", "feeling"],
    "lithosphere": ["geosphere"],
    "oxygen": [],
    "carbon dioxide": ["carbonic acid gas"],
    "hydrogen": [],
    "core": ["crux", "gist", "essence", "pith", "substance"],
    "crust": ["shell"],
    "mantle": ["pall", "drape", "blanket", "curtain", "pallium"],
    "longitude": ["meridian", "line of longitude"],
    "latitude": ["parallel", "parallel of latitude", "line of latitude"],
    "horizon": ["skyline", "view", "purview", "visible horizon"],
    "altitude": ["elevation", "height"],
    "disaster": ["calamity", "cataclysm", "catastrophe", "tragedy"],
    "mishap": ["mischance", "misadventure", "bad luck"],
    "catastrophic": ["catastrophal", "harmful", "ruinous"],
    "calamity": ["cataclysm", "catastrophe", "disaster", "tragedy"],
    "endanger": ["imperil", "jeopardize", "threaten", "menace", "expose", "peril"],
}

EXTERNAL_DETAILS = {
    "shell": {"pos": "n.", "meaning": "外壳；壳层，强调包在事物外面的硬质保护层"},
}


def normalized(term):
    return re.sub(r"\s+", " ", str(term or "").strip().lower().replace("_", " "))


def wordnet_pos(pos):
    result = []
    text = str(pos or "").lower()
    if re.search(r"(^|[/\s])n\.", text):
        result.append(wn.NOUN)
    if re.search(r"(^|[/\s])v[ti]?\.", text):
        result.append(wn.VERB)
    if "adj." in text:
        result.append(wn.ADJ)
    if "adv." in text:
        result.append(wn.ADV)
    return result or [None]


book = json.loads(BOOK_PATH.read_text(encoding="utf-8"))
old_details = json.loads(DETAILS_PATH.read_text(encoding="utf-8"))
words = [word for chapter in book["chapters"] for word in chapter["words"]]
by_term = {normalized(word["term"]): word for word in words}
new_details = {}

for word in words:
    source = normalized(word["term"])
    scored = {}
    for pos in wordnet_pos(word.get("pos")):
        for synset_index, synset in enumerate(wn.synsets(source.replace(" ", "_"), pos=pos)):
            for lemma in synset.lemmas():
                candidate = normalized(lemma.name())
                if candidate == source or candidate not in by_term:
                    continue
                score = (synset_index, -lemma.count(), candidate)
                if candidate not in scored or score < scored[candidate]:
                    scored[candidate] = score
    generated = [term for term, _ in sorted(scored.items(), key=lambda item: item[1])[:5]]
    synonyms = AUDITED_OVERRIDES.get(source, generated)
    synonyms = list(dict.fromkeys(normalized(term) for term in synonyms if normalized(term) != source))
    word["synonyms"] = synonyms

    for synonym in synonyms:
        if synonym in by_term:
            detail = by_term[synonym]
            new_details[synonym] = {
                "pos": detail.get("pos", ""),
                "meaning": detail.get("meaning", ""),
            }
        elif synonym in old_details:
            new_details[synonym] = old_details[synonym]
        elif synonym in EXTERNAL_DETAILS:
            new_details[synonym] = EXTERNAL_DETAILS[synonym]
        else:
            raise RuntimeError(f"Missing Chinese synonym detail: {source} -> {synonym}")

BOOK_PATH.write_text(json.dumps(book, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
DETAILS_PATH.write_text(json.dumps(dict(sorted(new_details.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

linked_words = sum(bool(word.get("synonyms")) for word in words)
links = sum(len(word.get("synonyms", [])) for word in words)
print(f"WORDS={len(words)} WITH_SYNONYMS={linked_words} LINKS={links} DETAILS={len(new_details)}")
