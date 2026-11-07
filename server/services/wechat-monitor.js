// 微信链路健康监控服务
// 追踪心跳、消息去重、熔断告警

const STATE = {
  // 每条桥接通道独立状态
  bridges: {
    gewechat: { lastHeartbeat: null, consecutiveFailures: 0, status: 'unknown', messageIds: new Set(), totalProcessed: 0, totalErrors: 0, totalPollAttempts: 0, totalPollFailures: 0 },
    callback:  { lastHeartbeat: null, consecutiveFailures: 0, status: 'unknown', messageIds: new Set(), totalProcessed: 0, totalErrors: 0 },
  },
  // 全局告警
  alerts: [],
  MAX_ALERTS: 50,
  // 配置
  MAX_CONSECUTIVE_FAILURES: 5,   // 连续失败N次 → offline
  HEARTBEAT_TIMEOUT_MS: 120_000,  // 2分钟内无心跳 → unknown/degraded
  MESSAGE_DEDUP_WINDOW: 300_000,   // 5分钟内同ID消息去重
  ALERT_COOLDOWN_MS: 600_000,      // 同类型告警10分钟内不重复
};

// ===== 心跳 =====

function heartbeat(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return;
  bridge.lastHeartbeat = Date.now();
  bridge.consecutiveFailures = 0;
  if (bridge.status !== 'online') {
    bridge.status = 'online';
    console.log(`[wechat-monitor] ${bridgeName} → online`);
  }
  cleanupOldMessageIds(bridge);
}

// ===== 错误率统计 =====

function recordMessageProcessed(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return;
  bridge.totalProcessed = (bridge.totalProcessed || 0) + 1;
}

function recordMessageError(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return;
  bridge.totalErrors = (bridge.totalErrors || 0) + 1;
}

function recordPollAttempt(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return;
  bridge.totalPollAttempts = (bridge.totalPollAttempts || 0) + 1;
}

function recordPollFailure(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return;
  bridge.totalPollFailures = (bridge.totalPollFailures || 0) + 1;
}

function getErrorStats(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return null;
  const total = (bridge.totalProcessed || 0) + (bridge.totalErrors || 0);
  const errorRate = total > 0 ? ((bridge.totalErrors || 0) / total * 100).toFixed(1) : '0.0';
  const pollTotal = (bridge.totalPollAttempts || 0);
  const pollErrorRate = pollTotal > 0 ? ((bridge.totalPollFailures || 0) / pollTotal * 100).toFixed(1) : '0.0';
  return {
    totalProcessed: bridge.totalProcessed || 0,
    totalErrors: bridge.totalErrors || 0,
    errorRate: errorRate + '%',
    pollAttempts: pollTotal,
    pollFailures: bridge.totalPollFailures || 0,
    pollErrorRate: pollErrorRate + '%',
  };
}

function recordFailure(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return;
  bridge.consecutiveFailures++;
  if (bridge.consecutiveFailures >= STATE.MAX_CONSECUTIVE_FAILURES && bridge.status !== 'offline') {
    bridge.status = 'offline';
    addAlert(bridgeName, 'offline', `连续 ${bridge.consecutiveFailures} 次失败，标记为离线`);
  }
}

// ===== 消息去重 =====

function isDuplicateMessage(bridgeName, messageId) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge || !messageId) return false;
  if (bridge.messageIds.has(messageId)) return true;
  bridge.messageIds.add(messageId);
  // 限制内存占用
  if (bridge.messageIds.size > 10000) {
    const entries = [...bridge.messageIds];
    bridge.messageIds = new Set(entries.slice(-5000));
  }
  return false;
}

function cleanupOldMessageIds(bridge) {
  // 不做定时清理，靠 size 限制 + 自然增长
}

// ===== 告警 =====

function addAlert(bridgeName, type, message) {
  // 冷却检查：同 bridge + 同 type 10分钟内不重复
  const now = Date.now();
  const recent = STATE.alerts.find(
    a => a.bridge === bridgeName && a.type === type && (now - a.time) < STATE.ALERT_COOLDOWN_MS
  );
  if (recent) return;

  const alert = { id: now.toString(36), bridge: bridgeName, type, message, time: now };
  STATE.alerts.unshift(alert);
  if (STATE.alerts.length > STATE.MAX_ALERTS) STATE.alerts.pop();

  console.error(`[wechat-monitor] ALERT [${bridgeName}] ${type}: ${message}`);
}

// ===== 状态查询 =====

function getBridgeStatus(bridgeName) {
  const bridge = STATE.bridges[bridgeName];
  if (!bridge) return { status: 'unknown', reason: 'bridge not found' };

  // 自动判断状态
  let status = bridge.status;
  if (bridge.lastHeartbeat) {
    const elapsed = Date.now() - bridge.lastHeartbeat;
    if (elapsed > STATE.HEARTBEAT_TIMEOUT_MS && status === 'online') {
      status = 'degraded';
      addAlert(bridgeName, 'degraded', `${Math.round(elapsed / 1000)}秒无心跳`);
    }
  }

  return {
    status,
    lastHeartbeat: bridge.lastHeartbeat ? new Date(bridge.lastHeartbeat).toISOString() : null,
    lastHeartbeatAgo: bridge.lastHeartbeat ? Math.round((Date.now() - bridge.lastHeartbeat) / 1000) + 's' : null,
    consecutiveFailures: bridge.consecutiveFailures,
    errorStats: getErrorStats(bridgeName),
  };
}

function getAllStatus() {
  return {
    gewechat: getBridgeStatus('gewechat'),
    callback: getBridgeStatus('callback'),
    alerts: STATE.alerts.slice(0, 10),
    overall: getOverallStatus(),
  };
}

function getOverallStatus() {
  const ge = getBridgeStatus('gewechat');
  const cb = getBridgeStatus('callback');
  if (ge.status !== 'online' && cb.status !== 'online') return 'all_offline';
  if (ge.status !== 'online' || cb.status !== 'online') return 'partial';
  return 'healthy';
}

function getAlerts(limit = 20) {
  return STATE.alerts.slice(0, limit);
}

export {
  heartbeat,
  recordFailure,
  isDuplicateMessage,
  recordMessageProcessed,
  recordMessageError,
  recordPollAttempt,
  recordPollFailure,
  getErrorStats,
  addAlert,
  getBridgeStatus,
  getAllStatus,
  getOverallStatus,
  getAlerts,
};
