# 第二轮：调整背景亮度阶梯、禁用字、以及六色的红/绿/黄/橙分离度
import math, itertools

def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def relLum(h):
    r, g, b = hex2rgb(h)
    return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)
def contrast(a, b):
    la, lb = relLum(a), relLum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)
def to_lab(h):
    r, g, b = [lin(c) for c in hex2rgb(h)]
    x = r*0.4124564 + g*0.3575761 + b*0.1804375
    y = r*0.2126729 + g*0.7151522 + b*0.0721750
    z = r*0.0193339 + g*0.1191920 + b*0.9503041
    xn, yn, zn = 0.95047, 1.0, 1.08883
    def f(t):
        return t ** (1/3) if t > 216/24389 else (841/108)*t + 4/29
    fx, fy, fz = f(x/xn), f(y/yn), f(z/zn)
    return 116*fy-16, 500*(fx-fy), 200*(fy-fz)
def Lstar(h): return to_lab(h)[0]
def de76(a, b):
    return math.dist(to_lab(a), to_lab(b))

# Machado 2009 severity=1.0 矩阵（线性 RGB 直接作用，比 Viénot 更贴合实证数据）
MACHADO = {
 'protan': [[0.152286, 1.052583, -0.204868],
            [0.114503, 0.786281, 0.099216],
            [-0.003882, -0.048116, 1.051998]],
 'deutan': [[0.367322, 0.860646, -0.227968],
            [0.280085, 0.672501, 0.041413],
            [-0.011820, 0.042940, 0.968881]],
 'tritan': [[1.255528, -0.076749, -0.178779],
            [-0.078411, 0.930809, 0.147602],
            [0.004733, 0.691367, 0.303900]],
}
def simulate(h, kind):
    M = MACHADO[kind]
    rgb = [lin(c) for c in hex2rgb(h)]
    out = [sum(M[i][j]*rgb[j] for j in range(3)) for i in range(3)]
    out = [min(1, max(0, c)) for c in out]
    def enc(c): return 12.92*c if c <= 0.0031308 else 1.055*(c**(1/2.4)) - 0.055
    return '#%02X%02X%02X' % tuple(round(enc(c)*255) for c in out)

# ---------- 背景 5 级 + 舞台 ----------
BG = [
 ('bg-sunken', '#08090C'),
 ('bg-page',   '#0D1015'),
 ('bg-panel',  '#141922'),
 ('bg-card',   '#1B222C'),
 ('bg-float',  '#252D3A'),
]
print('=== 背景 5 级 ===')
prev = None
for k, v in BG:
    d = '' if prev is None else f'  ΔL*={Lstar(v)-prev:+.2f}'
    print(f'{k:11s} {v}  L*={Lstar(v):5.2f}{d}')
    prev = Lstar(v)
STAGE = '#0B0E14'
print(f'{"stage":11s} {STAGE}  L*={Lstar(STAGE):5.2f}')

# ---------- 文字 ----------
FG = [('fg','#F2F6FA'), ('fg-2','#C4CEDA'), ('fg-3','#8D99A9'), ('fg-disabled','#6B7686')]
print('\n=== 文字层级对比度 ===')
print(f'{"token":12s}{"hex":10s} {"L*":>6s} {"vs sunken":>10s} {"vs panel":>9s} {"vs card":>8s} {"vs float":>9s}')
mapl = dict(BG)
for k, v in FG:
    print(f'{k:12s}{v:10s} {Lstar(v):6.2f} '
          f'{contrast(v, mapl["bg-sunken"]):9.2f} {contrast(v, mapl["bg-panel"]):8.2f} '
          f'{contrast(v, mapl["bg-card"]):7.2f} {contrast(v, mapl["bg-float"]):8.2f}')

# ---------- 语义色 ----------
print('\n=== 语义色 vs panel / sunken ===')
SEM = [('accent','#1ED0C0'), ('accent-cta','#EDF1F5'), ('success','#3FD07A'),
       ('warn','#F0B429'), ('danger','#FF5D57'), ('live','#7AB8FF')]
for k, v in SEM:
    print(f'{k:12s}{v}  L*={Lstar(v):5.1f}  vs panel {contrast(v, mapl["bg-panel"]):5.2f}:1  vs sunken {contrast(v, mapl["bg-sunken"]):5.2f}:1')

# ---------- 魔方六色 ----------
CUBE = {
 'U 白': '#F4F7FB',
 'D 黄': '#F5C93C',
 'L 橙': '#FA8A2E',
 'F 绿': '#3CC077',
 'B 蓝': '#5A8CF0',
 'R 红': '#D8413C',
}
print('\n=== 六色（主配色）===')
print(f'{"face":6s}{"hex":10s} {"L*":>6s} {"Y%":>6s} {"vs stage":>9s} {"vs 相邻舞台边缘":>0s}')
for k, v in CUBE.items():
    print(f'{k:6s}{v:10s} {Lstar(v):6.2f} {relLum(v)*100:6.2f} {contrast(v, STAGE):8.2f}:1')

print('\n--- L* 阶梯排序 ---')
order = sorted(CUBE.items(), key=lambda kv: -Lstar(kv[1]))
for i, (k, v) in enumerate(order):
    gap = '' if i == 0 else f'  ΔL*={Lstar(order[i-1][1])-Lstar(v):.2f}'
    print(f'  {k:6s} L*={Lstar(v):6.2f}{gap}')

print('\n--- 正常视觉：最小 6 对 ΔE76 ---')
rows = sorted((de76(a, b), abs(Lstar(a)-Lstar(b)), ka, kb)
              for (ka, a), (kb, b) in itertools.combinations(CUBE.items(), 2))
for d, dl, ka, kb in rows[:6]:
    print(f'  {ka+" / "+kb:14s} ΔE={d:6.2f}  ΔL*={dl:6.2f}')

for kind in ['deutan', 'protan', 'tritan']:
    sim = {k: simulate(v, kind) for k, v in CUBE.items()}
    rows = sorted((de76(sim[ka], sim[kb]), abs(Lstar(sim[ka])-Lstar(sim[kb])), ka, kb)
                  for (ka, _), (kb, _) in itertools.combinations(CUBE.items(), 2))
    print(f'\n--- [{kind}] 最小 6 对 ---')
    for d, dl, ka, kb in rows[:6]:
        print(f'  {ka+" / "+kb:14s} ΔE={d:6.2f}  ΔL*={dl:6.2f}   sim {sim[ka]} / {sim[kb]}')

# ---------- 替代配色 ----------
ALT = {
 'U 白': '#F4F7FB',
 'D 黄': '#F5C93C',
 'L 紫': '#B07CF5',   # 红绿色盲常见做法：橙换紫/粉
 'F 青': '#22C8C0',
 'B 蓝': '#5A8CF0',
 'R 品红': '#F05DA0',
}
sim = {k: simulate(v, 'deutan') for k, v in ALT.items()}
rows = sorted((de76(sim[ka], sim[kb]), ka, kb)
              for (ka, _), (kb, _) in itertools.combinations(ALT.items(), 2))
print('\n=== 替代配色（色觉辅助）deutan 最小 5 对 ===')
for d, ka, kb in rows[:5]:
    print(f'  {ka+" / "+kb:14s} ΔE={d:6.2f}')
print('  替代配色 vs stage 对比度：')
for k, v in ALT.items():
    print(f'    {k:6s} {v}  {contrast(v, STAGE):5.2f}:1')
