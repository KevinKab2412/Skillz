import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "to-visual"
LIBRARY = SKILL / "library"
REQUIRED = {
    "concept": {"name", "kind", "purpose", "familiar_as", "misconception", "op", "state", "actions", "visual", "sources", "origin", "tags"},
    "pattern": {"name", "kind", "purpose", "when", "how", "sources", "origin", "tags"},
}
OVERLAY = Path.home() / ".agents/to-visual/library"


def private_terms() -> set:
    """Repo names from the private overlay's origin tags (org/repo#N): they must never ship publicly."""
    terms = set()
    for card in OVERLAY.glob("*/*.md"):
        origin = next((line for line in card.read_text().splitlines() if line.startswith("origin:")), "")
        for org, repo in re.findall(r"([\w.-]+)/([\w.-]+)#\d+", origin):
            terms.update(t for t in (org, repo) if len(t) > 3)
    return terms


def frontmatter(path: Path) -> dict:
    text = path.read_text()
    match = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not match:
        raise AssertionError(f"{path.name}: no frontmatter block")
    fields = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(": ")
        if not sep:
            raise AssertionError(f"{path.name}: not a 'key: value' line: {line!r}")
        fields[key] = value.strip()
    return fields


class ConceptLibraryTest(unittest.TestCase):
    def test_every_seed_card_has_the_keys_for_its_kind(self):
        cards = sorted(LIBRARY.glob("*/*.md"))
        self.assertGreaterEqual(len(cards), 20)
        for card in cards:
            fields = frontmatter(card)
            kind = fields.get("kind")
            self.assertIn(kind, REQUIRED, card.name)
            self.assertEqual(REQUIRED[kind] - set(fields), set(), f"{card.name} is missing keys")
            self.assertTrue(all(fields[k] for k in REQUIRED[kind]), f"{card.name} has an empty required key")
            self.assertEqual(card.parent.name, kind + "s", f"{card.name} sits in the wrong folder")
            self.assertRegex(fields["tags"], r"^\[.*\]$", card.name)

    def test_seed_cards_are_marked_as_seed(self):
        for card in LIBRARY.glob("*/*.md"):
            self.assertTrue(frontmatter(card)["origin"].startswith("seed"), card.name)

    def test_nothing_from_the_private_overlay_ships_in_the_public_skill(self):
        terms = private_terms()
        if not terms:
            self.skipTest("no private overlay library on this machine")
        pattern = re.compile("|".join(re.escape(t).replace("\\-", "[-_ ]?") for t in sorted(terms)), re.I)
        leaks = [str(p.relative_to(ROOT)) for p in SKILL.rglob("*")
                 if p.is_file() and p.suffix in {".md", ".json", ".js", ".py", ".html", ".css"} and pattern.search(p.read_text(errors="ignore"))]
        self.assertEqual(leaks, [], "names from private repos belong in the overlay library, not the public skill")


if __name__ == "__main__":
    unittest.main()
