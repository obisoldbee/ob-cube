/**
 * main.ts —— 入口：只装配，零业务。
 * 具体装配在 wiring/，那里是唯一允许跨层 import 的地方。
 */

import './ui/tokens.css';
import './ui/layout.css';
import './ui/components.css';
import { bootstrap } from './wiring';

const host = document.getElementById('app');
if (host === null) throw new Error('缺少 #app 挂载点：index.html 被改动');

bootstrap(host);
