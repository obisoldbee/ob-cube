"""
魔方置换生成器 —— 可行性验证脚本（N=2/3/4 统一）

目的：在写任何 TypeScript 之前，证明"程序化几何生成置换表"这条路在数学上是
可靠的。如果这里过不了，ARCHITECTURE.md 的整个引擎方案就要推翻重做。

核心思想
--------
不使用任何手写置换数组。每个贴纸有唯一的三维位置与外法向量；一次转动 =
把落在指定层上的贴纸绕某轴旋转 90°/180°，再按旋转后的位置反查目标贴纸。

记法（与 PRD §5 / 附录 A 对齐）
-------------------------------
  R          转 1 层（外层）
  Rw         宽转，1..2 层
  3Rw        宽转，1..3 层
  2-3Rw      宽转，2..3 层（区间）
  2R         仅第 2 层（内层切片），不含外层
  3R         仅第 3 层
  R2 / R'    180° / 逆时针
  M / E / S  3 阶中层（等价 2L / 2D / 2F 的方向约定）
  x / y / z  整体旋转（本平台只用于相机，不进 state；此处仅为自测保留）

坐标系（右手系，与 Three.js 一致）
----------------------------------
  +x → 右   (R 面)      +y → 上 (U 面)      +z → 前 (F 面，朝观察者)

整数格点 0..N-1 表示位置。旋转时放大 2 倍并平移中心：
  q = 2p - (N-1)   →  q ∈ {-(N-1), -(N-3), ..., N-1}
这样 90° 旋转不引入浮点，也不会因为 N 为偶数时中心落在半格而失准。

运行
----
  python -B docs/research/permutation-proof.py
退出码 0 = 全部断言通过。
"""

from __future__ import annotations

import re
import sys

FACES = ("U", "D", "F", "B", "L", "R")

NORMALS = {
    "U": (0, 1, 0),
    "D": (0, -1, 0),
    "F": (0, 0, 1),
    "B": (0, 0, -1),
    "L": (-1, 0, 0),
    "R": (1, 0, 0),
}

# 面 → (轴索引, 外层在轴的哪一端)
FACE_AXIS = {
    "U": (1, "max"),
    "D": (1, "min"),
    "F": (2, "max"),
    "B": (2, "min"),
    "R": (0, "max"),
    "L": (0, "min"),
}

# 顺时针方向（从该面外部正对该面观察）对应的绕正轴转角符号。
# 推导：正角 = 从轴正端看向原点时的逆时针；故 +法向面（U/F/R）顺时针为 -1，
# 负法向面（D/B/L）的"顺时针"等于绕正轴的正角。
FACE_CLOCKWISE_SIGN = {"U": -1, "D": 1, "F": -1, "B": 1, "R": -1, "L": 1}

# 中层：M 跟随 L、E 跟随 D、S 跟随 F（Singmaster 约定）
SLICE_AXIS = {"M": (0, "L"), "E": (1, "D"), "S": (2, "F")}

MOVE_RE = re.compile(r"^(?:([1-9]\d?(?:-[1-9]\d?)?))?([UDLRFB])(w)?(2|')?$")
SLICE_RE = re.compile(r"^([MES])(2|')?$")
WHOLE_RE = re.compile(r"^([xyz])(2|')?$")


def facelet_position(face: str, r: int, c: int, n: int) -> tuple[int, int, int]:
    """(面, 行, 列) → 三维整数坐标。行 0 = 该面正视时的上沿，列 0 = 左沿。"""
    m = n - 1
    if face == "U":      # 俯视 U：F 在视野下方，B 在上方
        return (c, m, r)
    if face == "D":      # 仰视 D：F 在视野上方
        return (c, 0, m - r)
    if face == "F":      # 正视 F：U 在上
        return (c, m - r, m)
    if face == "B":      # 从背后看 B：U 在上，R 在视野左
        return (m - c, m - r, 0)
    if face == "L":      # 从左看 L：U 在上，B 在视野左
        return (0, m - r, c)
    if face == "R":      # 从右看 R：U 在上，F 在视野左
        return (m, m - r, m - c)
    raise ValueError(face)


def rotate(q: tuple[int, int, int], axis: int, quarters: int) -> tuple[int, int, int]:
    """绕 axis 旋转 quarters 个 90°（正 = 从轴正端看向原点的逆时针）。"""
    x, y, z = q
    for _ in range(quarters % 4):
        if axis == 0:      # 绕 x：(y, z) → (-z, y)
            y, z = -z, y
        elif axis == 1:    # 绕 y：(x, z) → (z, -x)
            x, z = z, -x
        elif axis == 2:    # 绕 z：(x, y) → (-y, x)
            x, y = -y, x
        else:
            raise ValueError(axis)
    return (x, y, z)


def _turns(token: str | None) -> int:
    if token == "2":
        return 2
    if token == "'":
        return -1
    return 1


def parse_move(move: str, n: int) -> tuple[int, set[int], int]:
    """解析记法 → (axis, layers, quarters)。非法或退化 move 抛 ValueError。"""
    s = move.strip()
    if not s:
        raise ValueError("空 move")

    m = WHOLE_RE.match(s)
    if m:
        axis = {"x": 0, "y": 1, "z": 2}[m.group(1)]
        return axis, set(range(n)), _turns(m.group(2))

    m = SLICE_RE.match(s)
    if m:
        name, tk = m.group(1), m.group(2)
        if n < 3 or n % 2 == 0:
            raise ValueError(f"{name} 需要 N>=3 且 N 为奇数，当前 N={n}")
        axis, ref = SLICE_AXIS[name]
        return axis, {n // 2}, _turns(tk) * FACE_CLOCKWISE_SIGN[ref]

    m = MOVE_RE.match(s)
    if not m:
        raise ValueError(f"无法解析 move：{move}")
    prefix, face, is_wide, tk = m.group(1), m.group(2), m.group(3), m.group(4)
    axis, side = FACE_AXIS[face]

    def layer(depth: int) -> int:
        """depth 从 1 起，1 = 该面最外层。"""
        if not 1 <= depth <= n:
            raise ValueError(f"{move}：层深 {depth} 超出 N={n} 的范围")
        return (n - 1) - (depth - 1) if side == "max" else (depth - 1)

    if prefix is None:
        lo = hi = 1
    elif "-" in prefix:
        a, b = prefix.split("-")
        lo, hi = int(a), int(b)
        if lo > hi:
            raise ValueError(f"{move}：层区间上界小于下界")
    elif is_wide:
        lo, hi = 1, int(prefix)
    else:
        # 无 w 的纯数字前缀 = 单层切片，例如 2R
        lo = hi = int(prefix)
        if lo < 2:
            raise ValueError(f"{move}：单层切片前缀必须 >= 2（1R 请直接写 R）")

    if is_wide and prefix is None:
        lo, hi = 1, min(2, n)

    layers = {layer(d) for d in range(lo, hi + 1)}
    if len(layers) == n:
        raise ValueError(f"{move}：覆盖全部 {n} 层，这是整体旋转而非层转动（应走视角 API）")

    return axis, layers, _turns(tk) * FACE_CLOCKWISE_SIGN[face]


def invert_move(move: str) -> str:
    if move.endswith("2"):
        return move
    if move.endswith("'"):
        return move[:-1]
    return move + "'"


# ----------------------------------------------------------------------------
# 置换构建
# ----------------------------------------------------------------------------

def facelets_of(n: int) -> list[tuple[str, int, int]]:
    return [(f, r, c) for f in FACES for r in range(n) for c in range(n)]


def build_lookup(n: int):
    pos_map: dict[tuple[tuple[int, int, int], tuple[int, int, int]], int] = {}
    fl = facelets_of(n)
    for idx, (f, r, c) in enumerate(fl):
        key = (facelet_position(f, r, c, n), NORMALS[f])
        if key in pos_map:
            raise AssertionError(f"位置冲突：{key}")
        pos_map[key] = idx
    if len(pos_map) != len(fl):
        raise AssertionError("位置索引不是双射")
    return pos_map, fl


def build_permutation(n: int, axis: int, layers: set[int], quarters: int) -> list[int]:
    """new_state[perm[i]] = old_state[i]"""
    pos_map, fl = build_lookup(n)
    m = n - 1
    perm = list(range(len(fl)))

    for src, (f, r, c) in enumerate(fl):
        p = facelet_position(f, r, c, n)
        if p[axis] not in layers:
            continue
        q = tuple(2 * v - m for v in p)
        q2 = rotate(q, axis, quarters)
        p2 = tuple((v + m) // 2 for v in q2)
        nv2 = rotate(NORMALS[f], axis, quarters)
        dst = pos_map.get((p2, nv2))
        if dst is None:
            raise AssertionError(f"旋转后找不到目标：{f}{r}{c} → {p2}/{nv2}")
        perm[src] = dst

    if sorted(perm) != list(range(len(perm))):
        raise AssertionError("生成的置换不是双射")
    return perm


def apply_perm(state: list[int], perm: list[int]) -> list[int]:
    out = [0] * len(state)
    for i, dst in enumerate(perm):
        out[dst] = state[i]
    return out


def compose(p: list[int], q: list[int]) -> list[int]:
    """先 p 后 q。"""
    return [p[q[i]] for i in range(len(p))]


def identity(n: int) -> list[int]:
    return list(range(len(facelets_of(n))))


# ----------------------------------------------------------------------------
# 断言
# ----------------------------------------------------------------------------

def check(n: int) -> list[str]:
    out: list[str] = []
    total = len(facelets_of(n))
    out.append(f"N={n}  贴纸数={total}")

    for face in FACES:
        axis, layers, q = parse_move(face, n)
        p = build_permutation(n, axis, layers, q)
        assert p != identity(n), f"N={n} {face} 置换为恒等"
        assert compose(p, build_permutation(n, axis, layers, -q)) == identity(n), f"{face} 与逆不互消"
        p4 = identity(n)
        for _ in range(4):
            p4 = compose(p4, p)
        assert p4 == identity(n), f"{face} 的阶不是 4"
        assert compose(p, p) == build_permutation(n, axis, layers, 2 * q), f"{face}2 不一致"
        out.append(f"  [ok] {face}: 非恒等 / 阶=4 / 与逆互消 / {face}2 一致")

    # 单面 90° 受影响贴纸数 = 该面能动贴纸 + 四个相邻面各 N 张
    #   奇数阶：面心贴纸原地不动 → N² - 1
    #   偶数阶：中心块自身也互换了 → N²
    expected = (n * n - (1 if n % 2 else 0)) + 4 * n
    for face in FACES:
        axis, layers, q = parse_move(face, n)
        p = build_permutation(n, axis, layers, q)
        moved = sum(1 for i, d in enumerate(p) if i != d)
        assert moved == expected, f"{face} 影响 {moved} 张，期望 {expected}"
    out.append(f"  [ok] 单面 90° 影响 {expected} 张贴纸（含面心处理差异）")

    # 3 阶中层
    if n == 3:
        for sl in ("M", "E", "S"):
            axis, layers, q = parse_move(sl, n)
            p = build_permutation(n, axis, layers, q)
            moved = sum(1 for i, d in enumerate(p) if i != d)
            assert moved == 4 * n, f"{sl} 影响 {moved} 张，期望 {4 * n}"
        # M 与 2L 必须是同一置换
        a1, l1, q1 = parse_move("M", n)
        a2, l2, q2 = parse_move("2L", n)
        assert (a1, l1, q1) == (a2, l2, q2), "M 与 2L 不等价"
        out.append(f"  [ok] M/E/S 各影响 {4 * n} 张，且 M == 2L")

    # 4 阶内层与宽转
    if n == 4:
        _, l2r, _ = parse_move("2R", n)
        _, lrw, _ = parse_move("Rw", n)
        assert l2r == {2} and lrw == {3, 2}, f"4 阶层映射错：2R={l2r} Rw={lrw}"
        _, l3rw, _ = parse_move("3Rw", n)
        _, l23, _ = parse_move("2-3Rw", n)
        # R 面在 x 正端，深度 1..3 对应 x = 3,2,1
        assert l3rw == {1, 2, 3} and l23 == {1, 2}, f"宽转区间错：{l3rw} / {l23}"
        out.append("  [ok] 4 阶层映射：2R={2} Rw={2,3} 3Rw={1,2,3} 2-3Rw={1,2}")

    # 退化 move 必须被拒绝
    for bad in (("3Rw", 2), ("Rw", 2), ("2-3L", 2), ("M", 2)):
        try:
            parse_move(*bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"N={bad[1]} 的 {bad[0]} 应被拒绝")
    out.append("  [ok] 退化 move 被拒绝（2 阶的 Rw/3Rw/M、覆盖全层的转动）")

    # 打乱 + 逆序逆操作 = 恒等
    scramble = ["R", "U", "R'", "F2", "L", "D'", "B", "U2"]
    if n == 3:
        scramble += ["M", "E'", "S2"]
    if n == 4:
        scramble += ["Rw", "2R", "3Uw", "2-3L", "3R'"]
    state = identity(n)
    for mv in scramble:
        state = apply_perm(state, build_permutation(n, *parse_move(mv, n)))
    assert state != identity(n), "打乱未改变状态"
    for mv in reversed(scramble):
        state = apply_perm(state, build_permutation(n, *parse_move(invert_move(mv), n)))
    assert state == identity(n), f"N={n} 打乱后逆序还原失败"
    out.append(f"  [ok] {len(scramble)} 步打乱 → 逆序逆操作 → 恒等")
    return out


def main() -> int:
    print("魔方置换生成器可行性验证")
    print("=" * 62)
    lines: list[str] = []
    for n in (2, 3, 4):
        lines += check(n)
        print("\n".join(lines))
        print("-" * 62)
        lines = []

    # 人工可核对的抽样：3 阶 F 顺时针，U 面底行 → R 面左列
    fl = facelets_of(3)
    perm = build_permutation(3, *parse_move("F", 3))
    print("\n抽样核对（3 阶 F 顺时针）：")
    for src in [fl.index(("U", 2, 0)), fl.index(("U", 2, 2)), fl.index(("R", 0, 0))]:
        print(f"  {fl[src]} → {fl[perm[src]]}")
    assert fl[perm[fl.index(("U", 2, 0))]] == ("R", 0, 0), "U 左下应转到 R 左上"

    print("\n" + "=" * 62)
    print("全部断言通过：程序化几何生成置换在 N=2/3/4 上均正确。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
