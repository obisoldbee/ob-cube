"""
五源对齐验证：ARCHITECTURE.md 的算法 vs 已验证的置换实现

为什么需要这一步
----------------
`permutation-proof.py` 证明了「程序化几何生成置换」这条路走得通，但它用的是
自己写的 (face, row, col) → 坐标 的 if-else 表。

`ARCHITECTURE.md §4.1/§4.3/§4.4` 用的是另一套表述：外法向量 + 列基 u + 行基 v +
位置公式 p = n·(N-1) + u·c(col) + v·c(row)，且 slot 顺序是 [U,R,F,D,L,B]。

两套实现如果有一处基向量写反、有一处符号错，就会产生「某一面的颜色矩阵镜像」
这类极难发现的静默错误。本脚本把架构文档的算法**逐字实现**，与已验证实现
逐张贴纸比对落点。

比对全部通过 => 架构文档可以直接作为实现契约。
运行：python -B docs/research/verify-spec-vs-proof.py
"""

from __future__ import annotations

import sys

import importlib.util
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("proof", _HERE / "permutation-proof.py")
proof = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(proof)


# ---------------------------------------------------------------------------
# 架构文档 §4.1：唯一允许手写的几何表（逐字抄录）
# ---------------------------------------------------------------------------
# 面: (外法向量 n, 列方向基 u, 行方向基 v)
ARCH_BASIS = {
    "U": ((0, 1, 0), (1, 0, 0), (0, 0, 1)),
    "D": ((0, -1, 0), (1, 0, 0), (0, 0, -1)),
    "F": ((0, 0, 1), (1, 0, 0), (0, -1, 0)),
    "B": ((0, 0, -1), (-1, 0, 0), (0, -1, 0)),
    "R": ((1, 0, 0), (0, 0, -1), (0, -1, 0)),
    "L": ((-1, 0, 0), (0, 0, 1), (0, -1, 0)),
}

# §4.3：slot 顺序 [U, R, F, D, L, B]
ARCH_SLOT_ORDER = ("U", "R", "F", "D", "L", "B")

# §4.4：正侧面 k=-1，负侧面 k=+1
ARCH_SIDE = {"U": "+", "D": "-", "F": "+", "B": "-", "R": "+", "L": "-"}

ARCH_AXIS = {"U": 1, "D": 1, "F": 2, "B": 2, "R": 0, "L": 0}


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def c(i: int, n: int) -> int:
    """§4.2 双倍坐标"""
    return 2 * i - (n - 1)


def arch_pos(face: str, row: int, col: int, n: int):
    nm, u, v = ARCH_BASIS[face]
    return tuple(
        nm[k] * (n - 1) + u[k] * c(col, n) + v[k] * c(row, n) for k in range(3)
    )


def rot90(p, axis: int, times: int):
    """§4.3 ROT90：x:(x,y,z)→(x,-z,y)  y:(x,y,z)→(z,y,-x)  z:(x,y,z)→(-y,x,z)"""
    x, y, z = p
    for _ in range(times % 4):
        if axis == 0:
            y, z = -z, y
        elif axis == 1:
            x, z = z, -x
        else:
            x, y = -y, x
    return (x, y, z)


def build_slot_table(n: int):
    slots = []
    for face in ARCH_SLOT_ORDER:
        for row in range(n):
            for col in range(n):
                slots.append((face, row, col, arch_pos(face, row, col, n), ARCH_BASIS[face][0]))
    index = {}
    for i, (_, _, _, p, nv) in enumerate(slots):
        key = (p, nv)
        assert key not in index, f"slot 位置重复：{key}"
        index[key] = i
    assert len(index) == 6 * n * n
    return slots, index


def arch_permutation(n: int, axis: int, axis_indices: set[int], k: int):
    """§4.3 GENERATE_PERMUTATION，A 用轴索引给出，内部换双倍坐标"""
    slots, index = build_slot_table(n)
    doubled = {c(a, n) for a in axis_indices}
    perm = list(range(len(slots)))
    for i, (_, _, _, p, nv) in enumerate(slots):
        if p[axis] not in doubled:
            continue
        p2 = rot90(p, axis, k)
        n2 = rot90(nv, axis, k)
        perm[index[(p2, n2)]] = i
    return perm


def arch_move_perm(n: int, move: str):
    """§4.4 + §5.3 的换算，直接给出 (axis, axis_indices, k)"""
    body = move
    suff = 1
    if body.endswith("2"):
        suff, body = 2, body[:-1]
    elif body.endswith("'"):
        suff, body = -1, body[:-1]

    wide = body.endswith("w")
    if wide:
        body = body[:-1]
    face = body[-1]
    prefix = body[:-1]

    # §5.3 切片分支：M 同 L、E 同 D、S 同 F，A 为唯一中间层
    if face in ("M", "E", "S"):
        assert prefix == "" and not wide, f"{move}：切片不接受前缀与宽转"
        axis, base_k = {"M": (0, 1), "E": (1, 1), "S": (2, -1)}[face]
        return axis, {(n - 1) // 2}, (base_k * suff) % 4

    if prefix == "":
        lo = hi = 1
    elif "-" in prefix:
        lo, hi = (int(x) for x in prefix.split("-"))
    elif wide:
        lo, hi = 1, int(prefix)
    else:
        lo = hi = int(prefix)
    if wide and prefix == "":
        lo, hi = 1, 2

    layers = list(range(lo, hi + 1))
    assert len(layers) < n, f"{move} 覆盖全层"
    positive = ARCH_SIDE[face] == "+"
    a = [n - l if positive else l - 1 for l in layers]

    base_k = -1 if positive else 1
    k = (base_k * suff) % 4
    return ARCH_AXIS[face], set(a), k


def proof_permutation(n: int, move: str):
    axis, layers, q = proof.parse_move(move, n)
    return proof.build_permutation(n, axis, layers, q)


def main() -> int:
    print("五源对齐验证：ARCHITECTURE.md 算法 vs 已验证实现")
    print("=" * 66)

    # 1. 基向量约束 u × v = -n
    for face, (nm, u, v) in ARCH_BASIS.items():
        cr = cross(u, v)
        neg = tuple(-x for x in nm)
        assert cr == neg, f"{face}: u×v={cr} 应为 -n={neg}"
        assert abs(dot(nm, u)) == 0 and abs(dot(nm, v)) == 0, f"{face}: 基与法向不正交"
    print("[ok] §4.1 六面基向量均满足 u×v = -n 且与法向正交")

    # 2. slot 位置与已验证实现一致（换到统一 face 顺序后比对坐标集合）
    for n in (2, 3, 4):
        arch_pts = {(f, arch_pos(f, r, cc, n)) for f in ARCH_SLOT_ORDER for r in range(n) for cc in range(n)}
        # 已验证实现的位置：换双倍坐标
        mine_pts = set()
        for f, r, cc in proof.facelets_of(n):
            p = proof.facelet_position(f, r, cc, n)
            mine_pts.add((f, tuple(c(v, n) for v in p)))
        assert arch_pts == mine_pts, f"N={n} 两套位置公式不等价"
    print("[ok] §4.1 位置公式与已验证实现的六面坐标逐个等价（N=2/3/4）")

    # 3. 逐 move 比对置换（换到统一 face 顺序）
    for n in (2, 3, 4):
        moves = [f + s for f in ("U", "D", "F", "B", "L", "R") for s in ("", "'", "2")]
        if n % 2 == 1:
            moves += [s for sl in ("M", "E", "S") for s in (sl, sl + "'", sl + "2")]
        if n == 4:
            moves += ["Rw", "Rw'", "3Uw", "2R", "3R'", "2-3Lw", "2-3Rw2"]

        mismatches = []
        for mv in moves:
            pa = arch_permutation(n, *arch_move_perm(n, mv))
            # arch slot 索引 → (face,row,col) 映射
            arch_slots = []
            for face in ARCH_SLOT_ORDER:
                for r in range(n):
                    for cc in range(n):
                        arch_slots.append((face, r, cc))
            # arch_to_mine：arch slot 序号 → 已验证实现的 slot 序号
            arch_to_mine = {i: proof.facelets_of(n).index(t) for i, t in enumerate(arch_slots)}
            # arch 语义 pa[dst]=src；两边序号都要换成统一序号
            pa_mine = [0] * len(pa)
            for dst_arch, src_arch in enumerate(pa):
                pa_mine[arch_to_mine[dst_arch]] = arch_to_mine[src_arch]

            # 已验证实现给出的是 src→dst，arch 给的是 dst→src，需转置
            pm = proof_permutation(n, mv)
            pm_src2dst = [0] * len(pm)
            for src, dst in enumerate(pm):
                pm_src2dst[dst] = src

            if pa_mine != pm_src2dst:
                mismatches.append(mv)

        assert not mismatches, f"N={n} 以下 move 两套实现不一致：{mismatches}"
        print(f"[ok] N={n}：{len(moves)} 个 move 的置换逐个等价")

    # 4. 语义抽检：R 把 F 面右列搬到 U 面右列（标准手转）
    n = 3
    slots, _ = build_slot_table(n)
    idx = {t[:3]: i for i, t in enumerate(slots)}
    pa = arch_permutation(n, *arch_move_perm(n, "R"))
    # pa[dst] = src
    dst = ("U", 1, 2)   # U 面中行右列
    src = slots[pa[idx[dst]]][:3]
    assert src == ("F", 1, 2), f"R 应把 F(1,2) 搬到 U(1,2)，实际来自 {src}"
    print("[ok] 语义抽检：R 把 F(1,2) 搬到 U(1,2)（与标准手转一致）")

    print("=" * 66)
    print("全部通过：架构文档的几何表、符号规则、层换算可直接作为实现契约。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
