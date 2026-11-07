// 微信链路监控服务 - 单元测试
import { describe, it, expect, beforeEach } from 'vitest';
import {
  heartbeat, recordFailure, isDuplicateMessage,
  getBridgeStatus, getOverallStatus, getAlerts
} from '../services/wechat-monitor.js';

describe('wechat-monitor', () => {
  // 心跳
  it('heartbeat marks bridge as online', () => {
    heartbeat('gewechat');
    const status = getBridgeStatus('gewechat');
    expect(status.status).toBe('online');
    expect(status.lastHeartbeat).toBeTruthy();
    expect(status.consecutiveFailures).toBe(0);
  });

  it('heartbeat resets consecutive failures', () => {
    recordFailure('callback');
    recordFailure('callback');
    expect(getBridgeStatus('callback').consecutiveFailures).toBe(2);
    
    heartbeat('callback');
    expect(getBridgeStatus('callback').status).toBe('online');
    expect(getBridgeStatus('callback').consecutiveFailures).toBe(0);
  });

  // 失败追踪
  it('consecutive failures trigger offline', () => {
    for (let i = 0; i < 5; i++) {
      recordFailure('gewechat');
    }
    expect(getBridgeStatus('gewechat').status).toBe('offline');
    expect(getBridgeStatus('gewechat').consecutiveFailures).toBe(5);
  });

  it('heartbeat recovers from offline', () => {
    for (let i = 0; i < 5; i++) recordFailure('callback');
    expect(getBridgeStatus('callback').status).toBe('offline');
    
    heartbeat('callback');
    expect(getBridgeStatus('callback').status).toBe('online');
  });

  // 消息去重
  it('isDuplicateMessage returns true for duplicate', () => {
    expect(isDuplicateMessage('gewechat', 'msg-001')).toBe(false);
    expect(isDuplicateMessage('gewechat', 'msg-001')).toBe(true);
  });

  it('isDuplicateMessage is bridge-scoped', () => {
    expect(isDuplicateMessage('gewechat', 'msg-002')).toBe(false);
    expect(isDuplicateMessage('callback', 'msg-002')).toBe(false);
  });

  it('isDuplicateMessage ignores empty id', () => {
    expect(isDuplicateMessage('gewechat', '')).toBe(false);
    expect(isDuplicateMessage('gewechat', null)).toBe(false);
  });

  // 整体状态
  it('getOverallStatus returns healthy when at least one bridge online', () => {
    heartbeat('callback');
    expect(getOverallStatus()).toBe('partial');
    
    heartbeat('gewechat');
    expect(getOverallStatus()).toBe('healthy');
  });

  it('getOverallStatus returns all_offline when all down', () => {
    for (let i = 0; i < 5; i++) {
      recordFailure('gewechat');
      recordFailure('callback');
    }
    expect(getOverallStatus()).toBe('all_offline');
  });

  // 告警
  it('alerts are recorded', () => {
    // 触发告警：offline
    for (let i = 0; i < 5; i++) recordFailure('gewechat');
    const alerts = getAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].type).toBe('offline');
  });

  // 未知桥接
  it('getBridgeStatus returns unknown for nonexistent bridge', () => {
    const status = getBridgeStatus('nonexistent');
    expect(status.status).toBe('unknown');
  });
});
