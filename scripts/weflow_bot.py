#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
猫猫侠 微信双向聊天 bot（WeFlow + 纯键盘 UIA）
===================================================
功能：
  1. 通过 WeFlow 本地 API (127.0.0.1:5031) 实时接收微信消息
  2. 转发到 cat-hero-life NAS 后端处理（LLM 对话）
  3. 用纯键盘模拟（Ctrl+F/Ctrl+V/Enter）把 AI 回复发回微信

架构：
  你的微信 ←→ WeFlow(SSE) ←→ weflow_bot.py ←→ cat-hero-life(NAS:3000)
            UIA 发送回复              AI 对话处理

依赖安装：
  pip install uiautomation pyperclip requests

前置条件：
  1. 微信 PC 已打开并登录（D:/Weixin/Weixin.exe）
  2. WeFlow 已安装、登录微信、开启 API 服务（设置→API 服务→启动，默认 5031）
  3. 本机与 NAS 在同一局域网

运行：
  python weflow_bot.py
  python weflow_bot.py --debug    # 打印详细日志
  python weflow_bot.py --poll     # 强制使用轮询模式（SSE 不稳定时）

环境变量：
  CAT_HERO_URL    猫猫侠地址，默认 http://192.168.68.161:3000
  WEFLOW_URL      WeFlow 地址，默认 http://127.0.0.1:5031
  SELF_WXID       你的 wxid（可选，过滤自己发的消息避免循环）
  WX_CHATS        监听的聊天对象名称，逗号分隔，默认只监听所有私聊
"""

import os
import sys
import json
import time
import logging
import threading
import random
import subprocess
import ctypes
from ctypes import wintypes
from datetime import datetime

# ========== 配置 ==========
CAT_HERO_URL = os.environ.get("CAT_HERO_URL", "http://192.168.68.161:3000").rstrip("/")
WEFLOW_URL   = os.environ.get("WEFLOW_URL", "http://127.0.0.1:5031").rstrip("/")
SELF_WXID    = os.environ.get("SELF_WXID", "")
WX_CHATS     = os.environ.get("WX_CHATS", "")          # 逗号分隔，空=所有私聊
POLL_INTERVAL = int(os.environ.get("WEFLOW_POLL", "2"))  # 轮询间隔秒（SSE 不可用时）
BUFFER_DELAY  = int(os.environ.get("WEFLOW_BUFFER", "1")) # 消息缓冲秒

log = logging.getLogger("cat-hero-weflow")

# ========== 日志 ==========
def setup_logging(debug=False):
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    h = logging.StreamHandler()
    h.setFormatter(fmt)
    log.addHandler(h)
    log.setLevel(logging.DEBUG if debug else logging.INFO)

# ====================================================================
#  消息接收：WeFlow HTTP API 轮询（主）+ SSE 流（辅）
#  WeFlow SSE 端点在实际版本中可能不暴露，轮询是兜底。
# ====================================================================

import requests

def weflow_health():
    """检查 WeFlow 是否可达"""
    try:
        r = requests.get(f"{WEFLOW_URL}/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def weflow_sessions():
    """获取 WeFlow 中的会话列表"""
    try:
        r = requests.get(f"{WEFLOW_URL}/api/v1/sessions?limit=200", timeout=10)
        if r.status_code == 200:
            data = r.json()
            return data.get("sessions", data) if isinstance(data, dict) else data
    except Exception as e:
        log.debug(f"获取会话列表失败: {e}")
    return []


def weflow_messages(session_id, limit=10):
    """拉取指定会话的最近消息"""
    try:
        r = requests.get(
            f"{WEFLOW_URL}/api/v1/messages",
            params={"session_id": session_id, "limit": limit},
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json()
            return data.get("messages", data) if isinstance(data, dict) else data
    except Exception as e:
        log.debug(f"获取消息失败 ({session_id[:12]}): {e}")
    return []


def weflow_sse_listen(on_message, on_error=None):
    """
    通过 SSE 实时监听 WeFlow 推送（如果 WeFlow 支持此端点）。
    返回 stop 回调函数。
    """
    stop_flag = threading.Event()

    def _listen():
        import re
        while not stop_flag.is_set():
            try:
                resp = requests.get(
                    f"{WEFLOW_URL}/sse",
                    headers={"Accept": "text/event-stream"},
                    stream=True,
                    timeout=300,
                )
                if resp.status_code != 200:
                    log.warning(f"SSE 连接失败: {resp.status_code}")
                    if on_error:
                        on_error(f"SSE status {resp.status_code}")
                    time.sleep(10)
                    continue

                log.info("SSE 已连接")
                buffer = ""
                for chunk in resp.iter_content(chunk_size=1, decode_unicode=True):
                    if stop_flag.is_set():
                        break
                    if chunk is None:
                        continue
                    # 兼容 bytes 和 str
                    if isinstance(chunk, bytes):
                        chunk = chunk.decode("utf-8", errors="replace")
                    buffer += chunk
                    # SSE 以 \n\n 分隔事件
                    while "\n\n" in buffer:
                        event_str, buffer = buffer.split("\n\n", 1)
                        try:
                            for line in event_str.split("\n"):
                                if line.startswith("data:"):
                                    data = json.loads(line[5:])
                                    on_message(data)
                                    break
                        except json.JSONDecodeError:
                            pass
            except requests.exceptions.ConnectionError:
                if not stop_flag.is_set():
                    log.warning("SSE 连接断开，10s 后重试...")
                    time.sleep(10)
            except Exception as e:
                if not stop_flag.is_set():
                    log.error(f"SSE 异常: {e}")
                    if on_error:
                        on_error(str(e))
                    time.sleep(5)

    t = threading.Thread(target=_listen, daemon=True)
    t.start()
    return lambda: stop_flag.set()


# ====================================================================
#  消息发送：纯键盘模拟 UIA（基于 Akasha-WeChat 成熟方案）
#  用 FindWindowW + AttachThreadInput + Ctrl+F/V/Enter，绝不用 EnumWindows / 树遍历
# ====================================================================

class SafeWeChatSender:
    """纯键盘微信消息发送器。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._last_contact = ""

    # ---------- 窗口定位 ----------

    @staticmethod
    def _find_hwnd():
        """FindWindowW 找微信主窗口句柄。单次调用，绝不 EnumWindows。"""
        hwnd = ctypes.windll.user32.FindWindowW("WeChatMainWndForPC", None)
        if hwnd:
            return hwnd
        # WeChat 3.x 可能用 Qt5 类名
        hwnd = ctypes.windll.user32.FindWindowW("Qt51514QWindowIcon", None)
        if hwnd:
            return hwnd
        return None

    @staticmethod
    def _ensure_foreground(hwnd):
        """AttachThreadInput 正确跨线程激活窗口。"""
        wechat_tid = ctypes.windll.user32.GetWindowThreadProcessId(hwnd, None)
        current_tid = ctypes.windll.kernel32.GetCurrentThreadId()
        ctypes.windll.user32.AttachThreadInput(current_tid, wechat_tid, True)
        try:
            ctypes.windll.user32.SetForegroundWindow(hwnd)
            ctypes.windll.user32.BringWindowToTop(hwnd)
        finally:
            ctypes.windll.user32.AttachThreadInput(current_tid, wechat_tid, False)
        time.sleep(0.3)

    # ---------- 联系人搜索 ----------

    def _switch_contact(self, contact):
        """Ctrl+F → 粘贴联系人名 → Enter"""
        import uiautomation as auto
        import pyperclip

        hwnd = self._find_hwnd()
        if not hwnd:
            return False
        self._ensure_foreground(hwnd)

        # Ctrl+F 打开搜索框
        auto.SendKeys("{Ctrl}f")
        time.sleep(0.5)

        # 清空已有内容
        auto.SendKeys("{Ctrl}a")
        time.sleep(0.15)

        # 粘贴联系人名称
        pyperclip.copy(contact)
        time.sleep(0.1)
        auto.SendKeys("{Ctrl}v")
        time.sleep(0.3)

        # Enter 选中第一个搜索结果
        auto.SendKeys("{Enter}")
        time.sleep(0.8)

        self._last_contact = contact
        return True

    # ---------- 发送文本 ----------

    def send_text(self, contact, text):
        """纯键盘发送文本消息到指定联系人或群聊。"""
        with self._lock:
            import uiautomation as auto
            import pyperclip

            hwnd = self._find_hwnd()
            if not hwnd:
                log.warning("微信窗口未找到（WeChat 可能未运行）")
                return False

            # 确保窗口活跃
            self._ensure_foreground(hwnd)

            # 切换到目标联系人（避免重复搜索）
            if contact and contact != self._last_contact:
                try:
                    self._switch_contact(contact)
                except Exception as e:
                    log.error(f"切换联系人失败: {e}")
                    return False

            try:
                # 模拟真人随机延迟
                time.sleep(random.uniform(0.3, 1.0))

                # 剪贴板复制消息
                pyperclip.copy(text)
                time.sleep(random.uniform(0.1, 0.3))

                # Ctrl+V 粘贴
                auto.SendKeys("{Ctrl}v")

                # 长消息多等一会
                paste_wait = min(len(text) * 0.02, 2.0) + random.uniform(0.3, 0.8)
                time.sleep(paste_wait)

                # Enter 发送
                auto.SendKeys("{Enter}")

                log.info(f"[TX→] {contact}: {text[:60]}{'…' if len(text)>60 else ''}")
                return True

            except Exception as e:
                log.error(f"[TX✗] {contact}: {e}")
                return False


# ====================================================================
#  核心引擎：消息接收 → AI 处理 → 回复发送
# ====================================================================

class WeflowBot:
    """WeFlow 双向聊天机器人"""

    def __init__(self, debug=False):
        self.sender = SafeWeChatSender()
        self.processed_ids = set()         # 已处理的消息 ID
        self.processed_max = 5000          # 去重集合上限
        self.buffer = {}                    # session_id → messages 缓冲
        self.buffer_lock = threading.Lock()
        self.buffer_timer = None
        self.debug = debug

    # ---------- 消息去重 ----------

    def _is_processed(self, msg_id):
        if msg_id in self.processed_ids:
            return True
        self.processed_ids.add(msg_id)
        if len(self.processed_ids) > self.processed_max:
            # 保留最近一半
            self.processed_ids = set(list(self.processed_ids)[self.processed_max // 2:])
        return False

    # ---------- 消息缓冲 ----------

    def _buffer_message(self, session_id, msg):
        with self.buffer_lock:
            if session_id not in self.buffer:
                self.buffer[session_id] = []
            self.buffer[session_id].append(msg)

    def _flush_buffer(self, session_id, contact_name):
        with self.buffer_lock:
            msgs = self.buffer.pop(session_id, [])
            if not msgs:
                return
        # 合并多条消息
        combined = "\n...\n".join(
            [m.get("content", str(m)) if isinstance(m, dict) else str(m) for m in msgs]
        )
        self._process_message(contact_name, combined)

    def _schedule_flush(self, session_id, contact_name):
        if self.buffer_timer:
            self.buffer_timer.cancel()
        self.buffer_timer = threading.Timer(
            BUFFER_DELAY, self._flush_buffer, args=[session_id, contact_name]
        )
        self.buffer_timer.daemon = True
        self.buffer_timer.start()

    # ---------- 消息处理 ----------

    def _process_message(self, contact_name, text):
        """发送到猫猫侠后端处理，获取 AI 回复并发送回微信。"""
        try:
            resp = requests.post(
                f"{CAT_HERO_URL}/api/chat/send",
                json={"message": text, "source": "wechat", "from": contact_name},
                timeout=30,
            )
            if resp.status_code == 200:
                data = resp.json()
                reply = data.get("reply", data.get("text", data.get("message", "")))
                if isinstance(reply, dict):
                    reply = reply.get("text", replay.get("reply", str(reply)))
                if reply and str(reply).strip():
                    self.sender.send_text(contact_name, str(reply))
                else:
                    log.info(f"[AI] {contact_name} → 无回复")
            else:
                log.warning(f"[AI] 猫猫侠返回 {resp.status_code}")
        except Exception as e:
            log.error(f"[AI] 处理失败: {e}")

    # ---------- SSE 回调 ----------

    def _on_sse_message(self, data):
        """处理 WeFlow SSE 推送的单条消息"""
        try:
            msg_id = data.get("id", data.get("message_id", str(time.time())))
            if self._is_processed(msg_id):
                return

            content = data.get("content", data.get("text", ""))
            if not content:
                return

            # 过滤自己发的消息（防循环）
            sender = data.get("sender_wxid", data.get("from_user", ""))
            if SELF_WXID and sender == SELF_WXID:
                return

            session_id = data.get("session_id", data.get("chat_id", ""))
            contact_name = data.get("talker_name", data.get("session_name", ""))

            # 白名单过滤
            if WX_CHATS:
                allowed = [c.strip() for c in WX_CHATS.split(",")]
                if contact_name not in allowed and session_id not in allowed:
                    return

            # 缓冲后发送
            self._buffer_message(session_id or contact_name, {"content": content, "id": msg_id})
            self._schedule_flush(session_id or contact_name, contact_name)

        except Exception as e:
            log.error(f"SSE 消息处理异常: {e}")

    # ---------- 轮询模式 ----------

    def poll_cycle(self):
        """轮询 WeFlow 获取新消息"""
        sessions = weflow_sessions()
        if not sessions:
            return

        # 确定要查询的会话
        targets = []
        if WX_CHATS:
            wanted = set(c.strip() for c in WX_CHATS.split(","))
            for s in sessions:
                sid = s.get("session_id", s.get("id", s.get("username", "")))
                name = s.get("display_name", s.get("name", sid))
                if name in wanted or sid in wanted:
                    targets.append(s)
        else:
            # 默认可：只监听私聊（session type=1 或非群聊），排除自己
            for s in sessions:
                stype = s.get("type", 1)
                sender = s.get("username", s.get("session_id", ""))
                if SELF_WXID and sender == SELF_WXID:
                    continue
                if stype == 1 or not s.get("is_group", False):
                    targets.append(s)

        # 拉消息
        for s in targets:
            sid = s.get("session_id", s.get("id", s.get("username", "")))
            name = s.get("display_name", s.get("name", s.get("username", sid)))
            if not sid:
                continue
            msgs = weflow_messages(sid, limit=5)
            for m in msgs:
                mid = m.get("id", m.get("message_id", ""))
                if not mid or self._is_processed(mid):
                    continue
                content = m.get("content", m.get("text", ""))
                if not content:
                    continue
                # 过滤自己
                mfrom = m.get("from_user", m.get("sender", ""))
                if SELF_WXID and mfrom == SELF_WXID:
                    continue
                self._process_message(name, content)

    # ---------- 出站消息（猫猫侠主动推送 → 微信） ----------

    def poll_outbox(self):
        """轮询猫猫侠待发通知队列，通过 UIA 发送到微信「文件传输助手」。"""
        try:
            r = requests.get(
                f"{CAT_HERO_URL}/api/wechat-bot/poll-outbox", timeout=10
            )
            if r.status_code != 200:
                return
            msgs = r.json().get("messages", [])
            for m in msgs:
                text = m.get("message", str(m))
                if text:
                    self.sender.send_text("文件传输助手", text)
        except Exception as e:
            log.debug(f"出站轮询异常: {e}")

    # ---------- 主循环 ----------

    def run(self, use_sse=True):
        log.info(f"🤖 猫猫侠 WeFlow 双向聊天 bot 启动")
        log.info(f"   WeFlow:  {WEFLOW_URL}")
        log.info(f"   猫猫侠: {CAT_HERO_URL}")
        log.info(f"   模式:   {'SSE + 轮询兜底' if use_sse else '纯轮询'}")
        log.info(f"   缓冲:   {BUFFER_DELAY}s")
        log.info(f"   出站:   每 {POLL_INTERVAL}s 轮询通知队列 → 文件传输助手")
        if SELF_WXID:
            log.info(f"   wxid:   {SELF_WXID}")

        if not weflow_health():
            log.error("❌ WeFlow 不可达，请确认 WeFlow 已启动且开启 API 服务（设置→API 服务→启动）")
            log.error(f"   预期地址: {WEFLOW_URL}/health")
            # 不退出，等待 WeFlow 上线
        else:
            log.info("✅ WeFlow 连接正常")

        # 启动 SSE（如果可用）
        sse_stop = None
        if use_sse:
            try:
                sse_stop = weflow_sse_listen(self._on_sse_message)
                log.info("SSE 监听已启动")
            except Exception as e:
                log.warning(f"SSE 启动失败({e})，使用纯轮询模式")

        # 主轮询循环（收消息 + 发出站通知）
        try:
            while True:
                self.poll_cycle()
                self.poll_outbox()
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            log.info("🛑 收到停止信号")
        finally:
            if sse_stop:
                sse_stop()


# ====================================================================
#  入口
# ====================================================================

if __name__ == "__main__":
    debug = "--debug" in sys.argv
    use_sse = "--poll" not in sys.argv   # --poll 强制纯轮询
    setup_logging(debug)

    bot = WeflowBot(debug=debug)
    bot.run(use_sse=use_sse)
