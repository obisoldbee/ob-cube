/**
 * color.ts —— 只读色彩数学（PRD AC-16 的 ΔE 判定基础）
 *
 * 纯函数、零 DOM：把 sRGB 十六进制转 CIELAB（D65），并给出 CIE76 色差。
 * 只服务于「遮蔽色 vs 贴纸色」的可自动化断言，不进入渲染热路径。
 */

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) throw new Error(`非法十六进制色值：${hex}`);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function labOf(hex: string): Lab {
  const [r, g, b] = parseHex(hex).map(srgbToLinear);
  // sRGB → XYZ（D65）
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  // XYZ → Lab（D65 白点）
  const fx = x / 0.95047;
  const fy = y / 1.0;
  const fz = z / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const l = 116 * f(fy) - 16;
  const a = 500 * (f(fx) - f(fy));
  const bb = 200 * (f(fy) - f(fz));
  return { l, a, b: bb };
}

/** CIE76 色差；PRD AC-16 只要求阈值比较，不要求 CIEDE2000 的精细度 */
export function deltaE76(hexA: string, hexB: string): number {
  const a = labOf(hexA);
  const b = labOf(hexB);
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}
