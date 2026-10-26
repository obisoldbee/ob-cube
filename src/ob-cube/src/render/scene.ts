/**
 * scene.ts —— 场景装配（ARCHITECTURE §8.2 / §8.5 / §8.6）
 *
 * 硬约束：
 *  - `shadowMap` 默认关闭：4 阶 96 张贴纸开阴影在集显上会掉帧，是已知的掉帧源
 *  - `devicePixelRatio` 上限 2（3x 屏按 3x 渲染是纯浪费）
 *  - 相机 fov 固定 45°，只改距离，不改 fov
 *  - 蒙尘态材质 unlit，光照对它无效 → 探针像素恒等于 --cube-masked（AC-16）
 */

import { AmbientLight, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { CubeSize } from '../contracts';
import { CameraRig, DEFAULT_VIEW } from './camera-rig';
import { CubeView } from './cube-view';
import { LayerOutline } from './layer-outline';
import { readPalette } from './palette';
import { TurnAnimator } from './turn-animator';

export interface CubeStage {
  readonly view: CubeView;
  readonly rig: CameraRig;
  readonly outline: LayerOutline;
  readonly animator: TurnAnimator;
  setSize(size: CubeSize): void;
  setDust(dust: boolean): void;
  render(): void;
  resize(): void;
  dispose(): void;
}

export function createCubeStage(canvas: HTMLCanvasElement): CubeStage | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;

  const palette = readPalette();
  const scene = new Scene();
  scene.background = palette.canvas.clone();

  const camera = new PerspectiveCamera(45, 1, 0.1, 200);
  const rig = new CameraRig(camera, canvas);
  const view = new CubeView(palette);
  const outline = new LayerOutline(palette.outline);
  const animator = new TurnAnimator(view.group);

  scene.add(view.group, outline.object);
  // 灯光颜色复用 --cube-face-u（近冷白）：TS 里不出现任何裸色值，
  // 且它本来就是这套配色里最亮的中性色。
  const lightColor = palette.face.U.clone();
  scene.add(new AmbientLight(lightColor.clone(), 0.82));
  const key = new DirectionalLight(lightColor.clone(), 0.62);
  key.position.set(5, 8, 6);
  const fill = new DirectionalLight(lightColor.clone(), 0.28);
  fill.position.set(-6, -3, -5);
  scene.add(key, fill);

  let size: CubeSize = 3;
  view.build(size);
  rig.setSize(size);
  rig.applyView(DEFAULT_VIEW, { animate: false });

  function resize(): void {
    const parent = canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? canvas.clientWidth);
    const height = Math.max(1, parent?.clientHeight ?? canvas.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    const pixelRatio = renderer.getPixelRatio();
    outline.setResolution(width * pixelRatio, height * pixelRatio);
  }

  resize();

  return {
    view,
    rig,
    outline,
    animator,
    setSize(next: CubeSize) {
      size = next;
      view.build(size);
      rig.setSize(size);
      outline.hide();
    },
    setDust(dust: boolean) {
      view.setDust(dust);
    },
    render() {
      rig.update(performance.now());
      renderer.render(scene, camera);
    },
    resize,
    dispose() {
      rig.dispose();
      animator.dispose();
      outline.dispose();
      view.dispose();
      renderer.dispose();
    },
  };
}

/**
 * 帧预算采样（ARCHITECTURE §8.5）：连续 10 帧 p95 > 20ms 时按序降级，
 * 并在 UI 上挂可见的「性能已降级」标记 —— **静默降级会让「为什么我的测试机看起来不一样」不可诊断**。
 */
export interface FrameBudget {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly longFrames: number;
  readonly degraded: boolean;
}

export function measureFrameBudget(samples: readonly number[], thresholdP95 = 20): FrameBudget {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return {
    p50: pick(0.5),
    p95: pick(0.95),
    max,
    longFrames: sorted.filter((value) => value > 50).length,
    degraded: pick(0.95) > thresholdP95,
  };
}
