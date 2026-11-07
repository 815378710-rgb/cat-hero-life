#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
猫猫侠 微信推送 bot（方案B：uiautomation 驱动 Windows 微信）
==============================================================
功能：轮询 cat-hero-life 的待发队列，用 uiautomation 把消息发到微信「文件传输助手」。

依赖安装（需联网，本机 pip 源已确认可用）：
    pip install uiautomation requests
    # 若默认源慢，用：pip install -i https://mirrors.aliyun.com/pypi/simple/ uiautomation requests

运行前置：
    1. 微信 PC 已打开并登录（D:\\Weixin\\Weixin.exe）。即使只在托盘（点×最小化到通知栏），
       bot 也会自动用 Windows API 把主窗口恢复到桌面，无需手动点托盘。
    2. 本机与 NAS 在同一局域网（默认访问 http://192.168.68.161:3000）。
    3. 运行：  python bot_ui.py
    4. 调试控件：python bot_ui.py --inspect   # 打印微信窗口控件树，用于确认控件名

环境变量（可选）：
    CAT_HERO_URL   覆盖 cat-hero-life 地址，默认 http://192.168.68.161:3000
    WX_POLL        轮询间隔秒，默认 15
"""
import os
import sys
import time
import subprocess
import ctypes
from ctypes import wintypes

import uiautomation as auto
import requests

CAT_HERO_URL = os.environ.get("CAT_HERO_URL", "http://192.168.68.161:3000").rstrip("/")
POLL_INTERVAL = int(os.environ.get("WX_POLL", "15"))
WX_CLASS = "WeChatMainWndForPC"
# 微信可执行文件（仅托盘时用来重新拉起以恢复主窗口）；可用 WX_EXE 环境变量覆盖
WX_EXE = os.environ.get("WX_EXE", r"D:\Weixin\Weixin.exe")


def find_wechat(restore=True):
    """返回微信主窗口控件，未运行/找不到返回 None。

    restore=True 时：若按类名找不到可见窗口，退而用 EnumWindows 找回被隐藏到托盘的
    主窗口句柄并恢复显示；仍找不到则尝试重新拉起微信 exe 恢复。这是"全自动"的关键，
    避免微信仅驻留托盘时 UIA 找不到窗口。
    """
    wx = auto.WindowControl(ClassName=WX_CLASS)
    if wx.Exists(3):
        return wx
    if not restore:
        return None
    # 按句柄 / PID 找回（含隐藏窗口），并恢复显示
    hwnds = _enum_wechat_hwnds()
    if not hwnds:
        _relaunch_wechat()
        time.sleep(3)
        hwnds = _enum_wechat_hwnds()
    for hwnd in hwnds:
        _restore_hwnd(hwnd)
    if hwnds:
        try:
            wx = auto.ControlFromHandle(hwnds[0])
            if wx and wx.Exists(2):
                return wx
        except Exception:
            pass
    return None


def _weixin_pids():
    """返回 Weixin.exe 的 PID 集合（tasklist 全量 CSV 解析，规避 /FI 过滤失效）。"""
    try:
        out = subprocess.run(
            ["tasklist", "/FO", "CSV"], capture_output=True, text=True, timeout=10
        ).stdout
        pids = set()
        for line in out.splitlines():
            if '"Weixin.exe"' in line:
                parts = line.split('","')
                try:
                    pids.add(int(parts[1].strip().strip('"')))
                except Exception:
                    pass
        return pids
    except Exception:
        return set()


def _enum_wechat_hwnds():
    """EnumWindows 枚举微信主窗口（含隐藏/托盘态）。优先按类名匹配，否则按 PID 匹配。"""
    try:
        user32 = ctypes.windll.user32
    except Exception:
        return []
    pids = _weixin_pids()
    class_hits = []
    pid_hits = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    buf = ctypes.create_unicode_buffer(256)
    pid = wintypes.DWORD()
    def callback(hwnd, lParam):
        user32.GetClassNameW(hwnd, buf, 256)
        if buf.value == WX_CLASS:
            class_hits.append(hwnd)
        else:
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value in pids:
                pid_hits.append(hwnd)
        return True
    try:
        user32.EnumWindows(WNDENUMPROC(callback), 0)
    except Exception:
        pass
    return class_hits or pid_hits


def _restore_hwnd(hwnd):
    """把隐藏/最小化窗口恢复到前台。"""
    try:
        user32 = ctypes.windll.user32
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, 9)   # SW_RESTORE
        else:
            user32.ShowWindow(hwnd, 1)   # SW_SHOWNORMAL
        time.sleep(0.4)
        user32.SetForegroundWindow(hwnd)
    except Exception:
        pass


def _relaunch_wechat():
    """微信单实例：重复拉起 exe 通常会把已登录的主窗口恢复到前台。"""
    try:
        subprocess.Popen([WX_EXE])
    except Exception:
        pass


def _wechat_process_running():
    """探测 Weixin.exe 进程是否在跑（跨会话也有效）。"""
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Weixin.exe"],
            capture_output=True, text=True, timeout=10,
        ).stdout
        # 注意：某些环境 tasklist /FI 过滤会静默失效，故改为在全文里匹配进程名
        return "Weixin.exe" in out
    except Exception:
        return None  # 探测失败，未知


def _dump_top_windows():
    """枚举所有顶层窗口，便于人工定位微信实际的 ClassName / Name。"""
    root = auto.GetRootControl()
    print("\n=== 顶层窗口列表（ClassName | Name）===")
    n = 0
    for w in root.GetChildren():
        try:
            cls = w.ClassName or ""
            name = w.Name or ""
        except Exception:
            continue
        if not cls and not name:
            continue
        marker = ""
        if "WeChat" in cls or "微信" in name or "weixin" in cls.lower():
            marker = "  <== 疑似微信"
        print(f"  {cls} | {name}{marker}")
        n += 1
    print(f"--- 共 {n} 个顶层窗口 ---")


def _controls_of(wx, ctrl_type):
    """收集某类型子控件（容错，部分 uiautomation 版本无 EditControls 方法）。"""
    try:
        return list(wx.GetControls(lambda c: c.ControlType == ctrl_type))
    except Exception:
        out = []
        try:
            for c in wx.GetChildren():
                if c.ControlType == ctrl_type:
                    out.append(c)
        except Exception:
            pass
        return out


def send_to_filehelper(text):
    """把 text 发送到微信「文件传输助手」。失败抛异常。"""
    wx = find_wechat()
    if not wx:
        raise RuntimeError("微信未运行，请先打开 D:\\Weixin\\Weixin.exe 并登录")

    wx.SwitchToThisWindow()
    time.sleep(0.6)

    # 1) 定位搜索框（微信4.x 搜索框 Name 可能为空，退而取第一个 Edit）
    search = wx.EditControl(Name="搜索")
    if not search.Exists(2):
        edits = _controls_of(wx, auto.ControlType.EditControl)
        search = edits[0] if edits else None
    if not search:
        raise RuntimeError("找不到微信搜索框")
    search.Click()
    time.sleep(0.3)
    auto.SetClipboardText("文件传输助手")
    search.SendKeys("{Ctrl}v")
    time.sleep(1.0)

    # 2) 选中「文件传输助手」会话
    item = auto.ListItemControl(Name="文件传输助手")
    if item.Exists(2):
        item.Click()
    else:
        auto.SendKeys("{Enter}")  # 回车选第一个搜索结果
    time.sleep(0.6)

    # 3) 定位输入框并粘贴文本
    edit = wx.EditControl(Name="输入")
    if not edit.Exists(2):
        edits = _controls_of(wx, auto.ControlType.EditControl)
        edit = edits[-1] if edits else None
    if not edit:
        raise RuntimeError("找不到微信输入框")
    edit.Click()
    time.sleep(0.2)
    auto.SetClipboardText(text)
    edit.SendKeys("{Ctrl}v")
    time.sleep(0.3)
    edit.SendKeys("{Enter}")
    time.sleep(0.6)


def poll_outbox():
    """拉取待发消息列表（消息文本数组）。"""
    try:
        r = requests.get(f"{CAT_HERO_URL}/api/wechat-bot/poll-outbox", timeout=10)
        if r.status_code != 200:
            return []
        return r.json().get("messages", [])
    except Exception as e:
        print(f"[poll] 拉取失败: {e}")
        return []


def inspect():
    """打印微信诊断信息：进程状态 + 自动恢复托盘窗口 + 控件树。"""
    proc = _wechat_process_running()
    print(f"[诊断] Weixin.exe 进程: {'运行中' if proc else ('未运行' if proc is False else '探测失败(未知)')}")

    # 自动恢复（托盘态）并打印控件树，便于确认控件 Name —— 发送时也会走同样逻辑
    wx = find_wechat(restore=True)
    _dump_top_windows()

    if not wx:
        print("\n结论：未找到任何微信窗口。常见原因→")
        print("  1) 微信根本没开（进程也未运行）；")
        print("  2) 微信窗口类名已变更（见上方列表，把实际 ClassName 反馈给我）。")
        return
    print("\n=== 微信窗口控件树（深度4）===")
    try:
        auto.LogControlHierarchy(wx, maxDepth=4)
    except Exception as e:
        print("打印失败:", e)


def main():
    if "--inspect" in sys.argv:
        inspect()
        return

    print(f"[bot] 启动：轮询 {CAT_HERO_URL}/api/wechat-bot/poll-outbox 每 {POLL_INTERVAL}s")
    print(f"[bot] 共 {len(_controls_of(find_wechat() or auto.PaneControl(), auto.ControlType.EditControl))} 个编辑框（微信未开则为0）")
    while True:
        try:
            msgs = poll_outbox()
            for m in msgs:
                try:
                    send_to_filehelper(m)
                    print(f"[send] ✓ {m[:50]}{'...' if len(m) > 50 else ''}")
                except Exception as e:
                    print(f"[send] ✗ 失败: {e}")
        except Exception as e:
            print(f"[loop] 异常: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
