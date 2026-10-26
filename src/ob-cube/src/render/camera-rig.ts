/**
 * camera-rig.ts —— 离散视角 ↔ OrbitControls 的薄封装（ARCHITECTURE §8.4）
 *
 * 只自写两件事，其余全交给 OrbitControls：
 *  1. `(up, front)` 离散 view ↔ 球坐标绑定，切换时 220ms 球坐标插值
 *     （不用四元数 slerp：球坐标插值在轨道相机上更稳）
 *  2. 输入仲裁：禁平移、限制极角（避免拖到正上/正下时万向锁导致手感发飘）
 *
 * 钉死一条：**拖动只改相机，不改 view。** 受限观察下用户能把相机拖到看见 D 面，
 * 但那三个未授权面仍是遮蔽材质 ——「能拖到」不等于「能看到」。
 */

import { PerspectiveCamera, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ViewState } from '../contracts';
import { FACE_NORMAL } from './cubie-factory';

const ISO_TILT = 0.62;
const TRANSITION_MS = 220;

export const DEFAULT_VIEW: ViewState = { up: 'U', front: 'F' };

function unit(face: 'U' | 'R' | 'F' | 'D' | 'L' | 'B'): Vector3 {
  const [x, y, z] = FACE_NORMAL[face];
  return new Vector3(x, y, z);
}

/** 离散 view → 相机方向（默认 3/4 视角；面视时正对） */
export function directionOf(view: ViewState, straight: boolean): Vector3 {
  const front = unit(view.front);
  const up = unit(view.up);
  if (straight) return front.clone().normalize();
  const right = new Vector3().crossVectors(up, front).normalize();
  return front.clone().addScaledVector(up, ISO_TILT).addScaledVector(right, ISO_TILT).normalize();
}

export class CameraRig {
  readonly controls: OrbitControls;
  private target = new Spherical();
  private from = new Spherical();
  private transitionStart = 0;
  private animating = false;
  private distance = 7.8;

  constructor(
    private readonly camera: PerspectiveCamera,
    dom: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.8;
    this.controls.minPolarAngle = Math.PI * 0.15;
    this.controls.maxPolarAngle = Math.PI * 0.85;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 40;
  }

  /** 切换阶数只改相机距离，不改 fov：改 fov 会连带改变透视强度，三阶会看起来更广角 */
  setSize(size: number): void {
    this.distance = 2.6 * size;
    const spherical = new Spherical().setFromVector3(this.camera.position);
    spherical.radius = this.distance;
    this.camera.position.setFromSpherical(spherical);
    this.controls.update();
  }

  applyView(view: ViewState, options: { straight?: boolean; animate?: boolean } = {}): void {
    const dir = directionOf(view, options.straight ?? false);
    const spherical = new Spherical().setFromVector3(dir.multiplyScalar(this.distance));
    this.from = new Spherical().setFromVector3(this.camera.position);
    this.target = spherical;
    this.transitionStart = performance.now();
    this.animating = options.animate !== false;
    if (!this.animating) this.snap();
  }

  reset(animate = true): void {
    this.applyView(DEFAULT_VIEW, { animate });
  }

  update(now: number): void {
    if (this.animating) {
      const raw = Math.min(1, (now - this.transitionStart) / TRANSITION_MS);
      const t = 1 - (1 - raw) ** 3;
      const spherical = new Spherical(
        this.from.radius + (this.target.radius - this.from.radius) * t,
        this.from.phi + (this.target.phi - this.from.phi) * t,
        this.from.theta + shortestAngle(this.from.theta, this.target.theta) * t,
      );
      this.camera.position.setFromSpherical(spherical);
      this.camera.lookAt(0, 0, 0);
      if (raw >= 1) this.animating = false;
    }
    this.controls.update();
  }

  private snap(): void {
    this.camera.position.setFromSpherical(this.target);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}

/** 取最短弧的角差（避免转 350° 而不是 -10°） */
export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
