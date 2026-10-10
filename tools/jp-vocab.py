#!/usr/bin/env python3
"""Check Japanese comment lines for cross-script contamination.

Generated Japanese picks up contamination that survives a rendered read:
simplified-only characters, stray Latin/German/Hangul fragments, and words that
look plausible but are not. Eyeballing the file is not a reliable gate, so the
rules below look at the bytes instead.

Two severities:

  FAIL  - an unambiguous corruption signal: a non-Japanese script, or U+FFFD.
  WARN  - a character this repository has never used before. Perfectly valid
          Japanese, so it is reported but does not fail the run. Use it as a
          prompt to re-read the line, not as a verdict.

Pair this with tools/jp-scan.py, which owns the simplified-character denylist.

Usage:
    python3 tools/jp-vocab.py <file>... --lines 12,40-43
    python3 tools/jp-vocab.py <file>... --all-comments
"""
import io
import os
import subprocess
import sys
import unicodedata

BASES = ["sync-sim.js", "sync.js", "tests/sync.test.cjs", "README.md"]

# Scripts that must never appear inside Japanese prose.
FOREIGN = (
    ("HANGUL", 0xAC00, 0xD7A3),
    ("HANGUL", 0x1100, 0x11FF),
    ("HANGUL", 0x3130, 0x318F),
    ("ARABIC", 0x0600, 0x06FF),
    ("ARABIC", 0x0750, 0x077F),
    ("CYRILLIC", 0x0400, 0x04FF),
    ("GREEK", 0x0370, 0x03FF),
    ("DEVANAGARI", 0x0900, 0x097F),
    ("THAI", 0x0E00, 0x0E7F),
)


def is_japanese(ch):
    o = ord(ch)
    return (
        0x3040 <= o <= 0x309F  # hiragana
        or 0x30A0 <= o <= 0x30FF  # katakana
        or 0x4E00 <= o <= 0x9FFF  # CJK ideographs
        or o in (0x3005, 0x3006)  # iteration marks
    )


def foreign_script(ch):
    o = ord(ch)
    for name, lo, hi in FOREIGN:
        if lo <= o <= hi:
            return name
    return None


def known_vocab():
    known = set()
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for rel in BASES:
        r = subprocess.run(
            ["git", "show", "HEAD:" + rel], capture_output=True, cwd=here
        )
        if r.returncode == 0:
            for ch in r.stdout.decode("utf-8"):
                if is_japanese(ch):
                    known.add(ch)
    return known


def parse_ranges(spec):
    wanted = set()
    for tok in spec.split(","):
        tok = tok.strip()
        if not tok:
            continue
        if "-" in tok:
            a, b = tok.split("-", 1)
            wanted.update(range(int(a), int(b) + 1))
        else:
            wanted.add(int(tok))
    return sorted(wanted)


def comment_lines(path, wanted):
    lines = io.open(path, encoding="utf-8").read().split("\n")
    out = []
    if wanted is None:
        for n, ln in enumerate(lines, 1):
            st = ln.strip()
            if st.startswith("//") or st.startswith("*") or st.startswith("/*"):
                out.append((n, ln))
    else:
        for n in wanted:
            if 1 <= n <= len(lines):
                out.append((n, lines[n - 1]))
    return out


def main():
    argv = sys.argv[1:]
    allc = "--all-comments" in argv
    if "--lines" not in argv and not allc:
        sys.stderr.write(__doc__)
        return 2
    argv = [a for a in argv if a != "--all-comments"]
    cut = argv.index("--lines") if "--lines" in argv else len(argv)
    files = argv[:cut]
    if not files:
        sys.stderr.write("usage: jp-vocab.py <file>... --lines 12,40-43\n")
        return 2

    known = known_vocab()
    fails = 0
    warns = 0
    checked = 0
    for f in files:
        wanted = None if allc else parse_ranges(argv[cut + 1])
        for n, ln in comment_lines(f, wanted):
            checked += 1
            if "�" in ln:
                print("%s:%d  FAIL  U+FFFD replacement char" % (f, n))
                fails += 1
                continue
            for ch in ln:
                script = foreign_script(ch)
                if script:
                    print("%s:%d  FAIL  %s char U+%04X %r" % (f, n, script, ord(ch), ch))
                    fails += 1
                    continue
                if is_japanese(ch) and ch not in known:
                    try:
                        nm = unicodedata.name(ch)
                    except ValueError:
                        nm = "?"
                    print("%s:%d  WARN  unseen char U+%04X %s (%s)" % (f, n, ord(ch), ch, nm))
                    warns += 1
    print("checked %d line(s): %d fail, %d warn" % (checked, fails, warns))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())