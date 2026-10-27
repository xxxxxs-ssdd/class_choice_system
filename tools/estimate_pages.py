# -*- coding: utf-8 -*-
"""
离线页数估算：按 docx 的 XML 版面参数逐块累加高度，模拟分页。
用已被 Word 实际打开过、app.xml 记录了真实页数的文档做校准。
"""
import math
import sys
import zipfile

from docx import Document
from docx.oxml.ns import qn

TWIP_CM = 2.54 / 1440.0


def cm_from_twips(v, default=None):
    try:
        return float(v) * TWIP_CM
    except (TypeError, ValueError):
        return default


def _val(el):
    return None if el is None else el.get(qn("w:val"))


def page_geometry(doc):
    from docx.shared import Emu
    sect = doc.sections[0]
    usable_w = Emu(int(sect.page_width) - int(sect.left_margin) - int(sect.right_margin)).cm
    usable_h = Emu(int(sect.page_height) - int(sect.top_margin) - int(sect.bottom_margin)).cm
    return usable_w, usable_h


def normal_size(doc):
    """Normal 样式的字号（pt）。"""
    st = doc.styles["Normal"]
    if st.font.size is not None:
        return st.font.size.pt
    return 10.5


def para_size(p_el, default):
    """段落内最大字号（pt）。"""
    sizes = []
    for sz in p_el.iter(qn("w:sz")):
        try:
            sizes.append(float(sz.get(qn("w:val"))) / 2.0)
        except (TypeError, ValueError):
            pass
    return max(sizes) if sizes else default


def para_metrics(p_el, default_size):
    ppr = p_el.find(qn("w:pPr"))
    size = para_size(p_el, default_size)
    mult, before, after, left, first = 1.0, 0.0, 0.0, 0.0, 0.0
    if ppr is not None:
        sp = ppr.find(qn("w:spacing"))
        if sp is not None:
            line = sp.get(qn("w:line"))
            rule = sp.get(qn("w:lineRule"))
            if line and rule in (None, "auto"):
                mult = float(line) / 240.0
            elif line and rule in ("exact", "atLeast"):
                mult = float(line) / 240.0
            before = cm_from_twips(sp.get(qn("w:before")), 0.0) or 0.0
            after = cm_from_twips(sp.get(qn("w:after")), 0.0) or 0.0
        ind = ppr.find(qn("w:ind"))
        if ind is not None:
            left = cm_from_twips(ind.get(qn("w:left")), 0.0) or 0.0
            first = cm_from_twips(ind.get(qn("w:firstLine")), 0.0) or 0.0
    return size, mult, before, after, left, first


def para_text(p_el):
    return "".join(t.text or "" for t in p_el.iter(qn("w:t")))


def units(text):
    """全角计 1，半角计 0.5。"""
    return sum(1.0 if ord(c) > 0x2E7F else 0.5 for c in text)


def estimate(path, verbose=False):
    doc = Document(path)
    usable_w, usable_h = page_geometry(doc)
    dsize = normal_size(doc)
    body = doc.element.body

    pages = [0.0]          # 当前页已用高度
    total = 0.0
    pending_break = False

    def place(cm):
        nonlocal total
        total += cm
        if pages[-1] + cm > usable_h and pages[-1] > 0.1:
            pages.append(0.0)
        pages[-1] += cm

    def page_break():
        if pages[-1] > 0.1:
            pages.append(0.0)

    for child in body.iterchildren():
        tag = child.tag
        if tag == qn("w:p"):
            if child.find(".//" + qn("w:br")) is not None:
                for br in child.iter(qn("w:br")):
                    if br.get(qn("w:type")) == "page":
                        page_break()
            txt = para_text(child)
            size, mult, before, after, left, first = para_metrics(child, dsize)
            h = before + after
            if txt.strip():
                eff_w = max(2.0, usable_w - left - first)
                cpl = eff_w / (size * 0.03528)
                lines = max(1, math.ceil(units(txt) / cpl))
                h += lines * size * 1.3 * mult / 28.35
            else:
                h += size * 1.3 * mult / 28.35
            place(h)
        elif tag == qn("w:tbl"):
            grid = [cm_from_twips(g.get(qn("w:w")), 0.0) for g in child.iter(qn("w:gridCol"))]
            for tr in child.findall(qn("w:tr")):
                row_h = 0.0
                for ci, tc in enumerate(tr.findall(qn("w:tc"))):
                    cw = None
                    tcw = tc.find(qn("w:tcPr") + "/" + qn("w:tcW"))
                    tcw = tc.find(qn("w:tcPr"))
                    if tcw is not None:
                        w_el = tcw.find(qn("w:tcW"))
                        if w_el is not None and w_el.get(qn("w:type")) == "dxa":
                            cw = cm_from_twips(w_el.get(qn("w:w")), None)
                    if cw is None:
                        cw = grid[ci] if ci < len(grid) else usable_w / 4.0
                    inner_w = max(1.5, cw - 0.38)      # 去掉单元格左右边距
                    cell_h = 0.0
                    for p in tc.findall(qn("w:p")):
                        size, mult, before, after, left, first = para_metrics(p, dsize)
                        txt = para_text(p)
                        cell_h += before + after
                        if txt.strip():
                            cpl = inner_w / (size * 0.03528)
                            lines = max(1, math.ceil(units(txt) / cpl))
                            cell_h += lines * size * 1.3 * mult / 28.35
                        else:
                            cell_h += size * 1.3 * mult / 28.35 * 0.6
                    row_h = max(row_h, cell_h + 0.06)
                place(row_h)
    if verbose:
        print("   usable: %.2f x %.2f cm, normal=%.1fpt" % (usable_w, usable_h, dsize))
    return len([p for p in pages]), total, usable_h, usable_w


def word_pages(path):
    try:
        app = zipfile.ZipFile(path).read("docProps/app.xml").decode("utf-8")
        import re
        m = re.search(r"<Pages>(\d+)</Pages>", app)
        return int(m.group(1)) if m else None
    except Exception:
        return None


if __name__ == "__main__":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    for p in sys.argv[1:]:
        est, total, uh, uw = estimate(p, verbose=True)
        print("   file:", p.split("\\")[-1])
        print("   估算高度 %.1f cm / 每页 %.1f cm  ->  约 %d 页" % (total, uh, est))
        wp = word_pages(p)
        print("   Word 记录页数:", wp if wp else "(无)")
        if wp:
            print("   校准系数: %.3f" % (est / float(wp)))
