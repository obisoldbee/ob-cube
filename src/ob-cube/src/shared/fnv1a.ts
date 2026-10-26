/**
 * FNV-1a 32 位哈希与项目内两种指纹格式。
 *
 * 选它的理由见 ARCHITECTURE §6.3：无依赖、跨引擎逐位一致（只用 Math.imul / ^ /
 * charCodeAt，全部有确定规范行为）、不需要密码学强度。
 *
 * 指纹在本项目只有一种合法用途：校验「同一段序列在同一版本引擎上重放出同一结果」。
 * 它不是局面等价性判据（ARCHITECTURE §3.5）。
 */

const FNV_PRIME = 0x01000193;
/** 双哈希的第一条流，标准 FNV-1a 32 offset basis */
const BASIS_A = 0x811c9dc5;
/** 双哈希的第二条流，刻意使用不同 offset basis 以降低碰撞 */
const BASIS_B = 0x050c5d1f;

/** 把 JS 字符串按 UTF-8 编码逐字节喂给 FNV-1a。手写编码，避免依赖 TextEncoder。 */
function fnv1aOfUtf8(text: string, basis: number): number {
  let hash = basis >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    // 代理对：合并为一个码点后按 4 字节编码
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      hash = Math.imul(hash ^ code, FNV_PRIME) >>> 0;
    } else if (code < 0x800) {
      hash = Math.imul(hash ^ (0xc0 | (code >> 6)), FNV_PRIME) >>> 0;
      hash = Math.imul(hash ^ (0x80 | (code & 0x3f)), FNV_PRIME) >>> 0;
    } else if (code < 0x10000) {
      hash = Math.imul(hash ^ (0xe0 | (code >> 12)), FNV_PRIME) >>> 0;
      hash = Math.imul(hash ^ (0x80 | ((code >> 6) & 0x3f)), FNV_PRIME) >>> 0;
      hash = Math.imul(hash ^ (0x80 | (code & 0x3f)), FNV_PRIME) >>> 0;
    } else {
      hash = Math.imul(hash ^ (0xf0 | (code >> 18)), FNV_PRIME) >>> 0;
      hash = Math.imul(hash ^ (0x80 | ((code >> 12) & 0x3f)), FNV_PRIME) >>> 0;
      hash = Math.imul(hash ^ (0x80 | ((code >> 6) & 0x3f)), FNV_PRIME) >>> 0;
      hash = Math.imul(hash ^ (0x80 | (code & 0x3f)), FNV_PRIME) >>> 0;
    }
  }
  return hash >>> 0;
}

/** UTF-8 字节序列上的 FNV-1a 32。seed 文本用它得到 seed32。 */
export function fnv1a32(text: string, basis: number = BASIS_A): number {
  return fnv1aOfUtf8(text, basis);
}

/** 固定 8 位小写十六进制。 */
export function hex8(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

/**
 * 项目内的 16 位指纹：两条不同 basis 的 FNV-1a 拼接。
 * 单个 32 位哈希在万级题目规模下碰撞已到千分之一量级，双哈希压到可忽略。
 */
export function fp32(text: string): string {
  return hex8(fnv1a32(text, BASIS_A)) + hex8(fnv1a32(text, BASIS_B));
}

/** seed 规范化后进题目记录的 8 位十六进制形式（ARCHITECTURE §6.2）。 */
export function seedHex(seed32: number): string {
  return hex8(seed32);
}
