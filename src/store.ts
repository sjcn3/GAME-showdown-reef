/**
 * 全局单例。场景之间通过它共享进度，避免互相 import。
 */

import { GameState } from './core/GameState';

export const gameState = new GameState();
