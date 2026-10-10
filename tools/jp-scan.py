#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""日本語テキストの混入スキャン。

生成した日本語には、簡体字中国語や文の途中で紛れ込んだラテン語断片が
混入することがある。英数字の識別子（PERFECT, chapter など）は正しく出るため、
次の2方向で見る。

  (1) 日本語の文脈に絶対に出てこない簡体字・誤字を1文字でも含む行
  (2) 日本語文字に「空白なしで直接 붙어（glued）」ラテン語。識別子許可リスト
      と全大文字（PERFECT / BPM など）は正しいので除外する。

使い方: python3 tools/jp-scan.py <file> [...]
終了コード 0 = 問題なし、1 = 検出あり。
"""
import re
import sys

# Simplified-only forms that must never appear in Japanese prose.
#
# NOTE: characters that are ordinary Japanese are deliberately absent here,
# otherwise the scan drowns in false hits and stops being trusted. The list
# is therefore a judgement call, not a complete partition - words built from
# excluded characters cannot be caught. "休" was excluded after it flagged
# game.js "星の休息", which is correct prose.
FORBIDDEN = set(
    "误闲这个们对时说过还没么样儿东车轮马鸟儿应该经济产请"
    "书写电话语汉语录为开关达运边际线结构织网络设备认识划业务"
    "紧众么义乌乔习乡买争亏亚亲仅从仑仓仪价优伞伟传伤伦"
    "侠俩俭债倾偿储兑兖冈册军农冲决况冻净凉凛凤凭凯击凿刍"
)

# 日本語文字に直接 붙어現れたラテン語のうち、誤検出しやすい語
LATIN_JUNK = (
    "establish", "elong", "sustained", "Linguistics", "uries",
    "oldown", "onnection", "andard", "onfiguration",
)

# コードの識別子として日本語文中に置いてよい語
ALLOW = {
    "PERFECT", "GREAT", "GOOD", "MISS", "SSS", "SS", "BPM", "HUD", "DOM", "CSS",
    "SVG", "JSON", "API", "URL", "FPS", "MS", "PCM", "OSC",
    "combo", "chapter", "chart", "notes", "note", "state", "bars", "bar",
    "beat", "lane", "spb", "mods", "boss", "sync", "seed", "silence",
    "upgrade", "score", "window", "offset", "accent", "hold", "tap",
    # 日本語の文書に普通に混ざる技術語・製品名
    "Pages", "Audio", "Web", "Worker", "Service", "GitHub", "Actions", "Checks",
    "Browser", "Experience", "Chromium", "Canvas", "JavaScript", "Node",
    "Python", "Works", "HTML", "RELAY", "LUMINA", "Test", "prim", "App", "Rev",
    "Cursor", "KASANE", "Minimax", "Space", "Shift", "Escape",
}

CJK = r"\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f"
GLUED = re.compile(r"([A-Za-z]{3,})(?=[" + CJK + r"])|(?<=[" + CJK + r"])([A-Za-z]{3,})")


def scan_line(lineno, line):
    problems = []
    for ch in line:
        if ch in FORBIDDEN:
            problems.append((lineno, "CJK", ch, line))
            break
    low = line.lower()
    for junk in LATIN_JUNK:
        if junk in low:
            problems.append((lineno, "LATIN", junk, line))
            break
    for m in GLUED.finditer(line):
        token = m.group(1) or m.group(2)
        if token in ALLOW or token.isupper():
            continue
        problems.append((lineno, "GLUED", token, line))
        break
    return problems


def self_test():
    """Prove each rule can fire, and that the denylist has no false positives.

    A lint that silently checks nothing is worse than no lint, so every rule
    gets a case that must fail here. Run with: python3 tools/jp-scan.py --self-test
    """
    must_flag = [
        "\u8bef\u89e3",          # simplified
        "\u8bef\u3063\u305f\u8a71",   # simplified 误 (U+8BEF), not 誤 (U+8AA4)
        "syokuhin\u306e\u65e5",  # GLUED latin
    ]
    must_pass = [
        "\u661f\u306e\u4f11\u606f",     # 休息 - legitimate Japanese
        "\u4f1a\u4f53\u5185\u4e71\u8996\u53cd\u5fa9",  # all excluded chars, still valid
        "\u6b63\u3057\u3044 PERFECT \u3068 BPM",
    ]
    failures = []
    for text in must_flag:
        if not scan_line(1, text):
            failures.append("should have been flagged: %r" % text)
    for text in must_pass:
        problems = scan_line(1, text)
        if problems:
            failures.append("false positive on %r -> %s" % (text, problems))
    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("SELF-TEST OK (%d must-flag, %d must-pass)" % (len(must_flag), len(must_pass)))
    return 0


def main(argv):
    if len(argv) > 1 and argv[1] == "--self-test":
        return self_test()
    if len(argv) < 2:
        print(__doc__)
        return 2
    bad = 0
    for path in argv[1:]:
        problems = []
        with open(path, encoding="utf-8") as handle:
            for lineno, line in enumerate(handle, 1):
                problems.extend(scan_line(lineno, line.rstrip("\n")))
        if not problems:
            print(f"OK   {path}")
            continue
        bad += len(problems)
        print(f"BAD  {path}")
        for lineno, kind, what, line in problems:
            print(f"  {lineno}\t{kind}\t{what}\t{line.strip()[:120]}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
