"""Conservative Polish normalization. No global replacement of bare numbers."""
import re
from datetime import date
from decimal import Decimal
from num2words import num2words

MONTHS = "stycznia lutego marca kwietnia maja czerwca lipca sierpnia września października listopada grudnia".split()
DAYS = "pierwszego drugiego trzeciego czwartego piątego szóstego siódmego ósmego dziewiątego dziesiątego jedenastego dwunastego trzynastego czternastego piętnastego szesnastego siedemnastego osiemnastego dziewiętnastego dwudziestego".split()

def day_words(day):
    if day <= 20:
        return DAYS[day-1]
    if day < 30:
        return "dwudziestego " + DAYS[day-21]
    return "trzydziestego" + (" pierwszego" if day == 31 else "")

PROTECTED = re.compile(r"(?:https?://|www\.)[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


def cardinal(n):
    return num2words(int(n), lang="pl")


def _plain(text):
    def money(m):
        value = Decimal(m[1].replace(" ", "").replace(",", "."))
        return num2words(value, lang="pl", to="currency", currency="PLN").replace(",", " i")
    text = re.sub(r"(?<![\w.,])([0-9]{1,3}(?: [0-9]{3})+(?:,[0-9]{2})?|[0-9]{1,9}(?:,[0-9]{2})?)\s*zł(?!\w)", money, text)
    def percent(m):
        parts = m[1].split(",")
        return cardinal(parts[0]) + (" przecinek " + " ".join(cardinal(x) for x in parts[1]) if len(parts)>1 else "") + " procent"
    text = re.sub(r"(?<![\w.,])([0-9]{1,9}(?:,[0-9]{1,4})?)%(?!\w)", percent, text)
    def clock(m):
        h, minute = int(m[1]), int(m[2])
        if h > 23 or minute > 59:
            return m[0]
        # Neutral digit reading, avoids guessing grammatical case of an ordinal hour.
        return cardinal(h) + " " + ("zero " if minute < 10 else "") + cardinal(minute)
    text = re.sub(r"(?<![\w:])([0-9]{1,2}):([0-9]{2})(?![\w:])", clock, text)
    def calendar(m):
        d, month, y = map(int, m.groups())
        try:
            date(y, month, d)
        except ValueError:
            return m[0]
        # Support a bounded modern date range; leave other years intact.
        if not 2001 <= y <= 2099:
            return m[0]
        ordinal = num2words(y - 2000, lang="pl", to="ordinal")
        year = " ".join(w[:-1] + ("iego" if w.endswith("i") else "ego") for w in ordinal.split())
        return f"{day_words(d)} {MONTHS[month-1]} dwa tysiące {year} roku"
    text = re.sub(r"(?<![\w.])([0-9]{2})\.([0-9]{2})\.([0-9]{4})(?![\w.])", calendar, text)
    return text


def normalize_text(text):
    # Only entire numeric input; do not strip spaces around protected URLs.
    if re.fullmatch(r"(?:0|[1-9][0-9]{0,8})", text):
        return cardinal(text)
    result, offset = [], 0
    for m in PROTECTED.finditer(text):
        result.extend((_plain(text[offset:m.start()]), m[0]))
        offset = m.end()
    result.append(_plain(text[offset:]))
    return "".join(result)
