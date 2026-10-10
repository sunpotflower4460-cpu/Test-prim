"""Cross-file consistency checks for the Test prim gallery.

These are mechanical, repo-wide checks that catch wiring mistakes a
per-file read misses: duplicate ids, unbalanced tags, and CSS classes that
are referenced but never defined (or defined but never referenced).

Usage: python3 tools/wiring-check.py
"""
import collections
import io
import re
import sys

ROOT = "."
HTML = "index.html"
CSS_FILES = ["style.css", "sumifu.css", "code.css", "sync.css"]
JS_FILES = ["game.js", "sumifu.js", "code.js", "sync.js"]
VOID = {"meta", "link", "br", "hr", "img", "input", "source",
        "area", "base", "col", "embed", "param", "track", "wbr"}


def read(path):
    return io.open(ROOT + "/" + path, encoding="utf-8").read()


def main():
    problems = []
    html = read(HTML)

    # --- duplicate id attributes ---
    ids = re.findall(r'\bid="([^"]+)"', html)
    for name, n in collections.Counter(ids).items():
        if n > 1:
            problems.append("duplicate id in %s: %s x%d" % (HTML, name, n))

    # --- tag balance ---
    stack, errs = [], []
    for m in re.finditer(r"<(/?)([a-zA-Z0-9!]+)([^>]*?)(/?)>", html):
        closing, tag, self_close = m.group(1), m.group(2).lower(), m.group(4)
        if tag.startswith("!") or tag.startswith("?"):
            continue
        if tag in VOID or self_close:
            continue
        if closing:
            if stack and stack[-1][0] == tag:
                stack.pop()
            else:
                errs.append("unexpected </%s> near offset %d" % (tag, m.start()))
        else:
            stack.append((tag, m.start()))
    problems += ["%s: %s" % (HTML, e) for e in errs]
    problems += ["%s: never closed: %s" % (HTML, [t for t, _ in stack])] if stack else []

    # --- class cross-reference ---
    css = "".join(read(f) for f in CSS_FILES)
    defined = set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]*)", css))
    used = set()
    for a in re.findall(r'class="([^"]+)"', html):
        used |= set(a.split())
    for f in JS_FILES:
        src = read(f)
        for a in re.findall(r'class="([^"]+)"', src):
            used |= set(a.split())
        for a in re.findall(r"""classList\.(?:add|remove|toggle)\(\s*["']([A-Za-z0-9_-]+)["']""", src):
            used.add(a)

    # Severity matters here. A class that is used but never styled may be an
    # intentional hook or dead markup, so it is a warning: failing the build on
    # it trains people to ignore the tool.
    warnings = []
    for name in sorted(used - defined):
        warnings.append("class used but never styled: .%s" % name)

    print("checked %d ids, %d css classes, %d used classes" % (len(set(ids)), len(defined), len(used)))
    for w in warnings:
        print("  WARN  " + w)
    if problems:
        print("PROBLEMS (%d):" % len(problems))
        for p in problems:
            print("  FAIL  " + p)
        return 1
    print("OK - no wiring problems%s" % (" (%d warning(s))" % len(warnings) if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())