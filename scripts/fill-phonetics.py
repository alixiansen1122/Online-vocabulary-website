import json
import re
import unicodedata
from pathlib import Path

import eng_to_ipa as ipa
from g2p_en import G2p


DATA_PATH = Path("src/data/bbdc-yszch.json")

ARPABET_TO_IPA = {
    "AA": "ɑ",
    "AE": "æ",
    "AH": "ʌ",
    "AO": "ɔ",
    "AW": "aʊ",
    "AY": "aɪ",
    "B": "b",
    "CH": "tʃ",
    "D": "d",
    "DH": "ð",
    "EH": "ɛ",
    "ER": "ɝ",
    "EY": "eɪ",
    "F": "f",
    "G": "g",
    "HH": "h",
    "IH": "ɪ",
    "IY": "i",
    "JH": "dʒ",
    "K": "k",
    "L": "l",
    "M": "m",
    "N": "n",
    "NG": "ŋ",
    "OW": "oʊ",
    "OY": "ɔɪ",
    "P": "p",
    "R": "r",
    "S": "s",
    "SH": "ʃ",
    "T": "t",
    "TH": "θ",
    "UH": "ʊ",
    "UW": "u",
    "V": "v",
    "W": "w",
    "Y": "j",
    "Z": "z",
    "ZH": "ʒ",
}


def ascii_term(term):
    text = unicodedata.normalize("NFKD", term)
    return "".join(char for char in text if not unicodedata.combining(char))


def clean_ipa(text):
    text = text.replace("*", "").replace("rɪˈkɔrd", "ˈrɛkərd")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def dictionary_ipa(term):
    candidates = [term, ascii_term(term)]
    if term.endswith("ise"):
        candidates.append(term[:-3] + "ize")
    if term.endswith("isation"):
        candidates.append(term[:-7] + "ization")

    for candidate in candidates:
        converted = ipa.convert(candidate)
        if converted and "*" not in converted:
            return clean_ipa(converted)
    return ""


def arpabet_token_to_ipa(token):
    match = re.fullmatch(r"([A-Z]+)([0-2]?)", token)
    if not match:
        return token.lower()

    sound, stress = match.groups()
    if sound == "AH" and stress == "0":
        ipa_sound = "ə"
    elif sound == "ER" and stress == "0":
        ipa_sound = "ɚ"
    else:
        ipa_sound = ARPABET_TO_IPA.get(sound, sound.lower())

    if stress == "1":
        return "ˈ" + ipa_sound
    if stress == "2":
        return "ˌ" + ipa_sound
    return ipa_sound


def g2p_ipa(term, g2p):
    normalized = ascii_term(term.replace("’", "'"))
    phones = g2p(normalized)
    converted = []
    for phone in phones:
        if phone == " ":
            converted.append(" ")
        elif re.fullmatch(r"[A-Z]+[0-2]?", phone):
            converted.append(arpabet_token_to_ipa(phone))
    text = "".join(converted)
    return re.sub(r"\s+", " ", text).strip()


def phonetic_for(term, g2p):
    value = dictionary_ipa(term)
    if not value:
        value = g2p_ipa(term, g2p)
    return f"/{value}/" if value else ""


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8-sig"))
    g2p = G2p()
    total = 0
    filled = 0
    missing = []

    for chapter in data.get("chapters", []):
        for word in chapter.get("words", []):
            total += 1
            term = str(word.get("term", "")).strip()
            phonetic = phonetic_for(term, g2p)
            word["phonetic"] = phonetic
            if phonetic:
                filled += 1
            else:
                missing.append(term)

    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print({"total": total, "filled": filled, "missing": len(missing)})
    if missing:
        print(missing[:50])


if __name__ == "__main__":
    main()
