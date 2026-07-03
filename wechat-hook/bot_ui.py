"""猫猫侠微信机器人 v3.0 - 键盘版
最可靠方案：直接操作微信窗口，用快捷键读写消息
稳定性第一，防封第一
"""

import time, json, os, sys, threading, requests, pyperclip, random
import tkinter as tk
from tkinter import messagebox, scrolledtext

CAT_HERO_URL = "http://127.0.0.1:3000/api/wechat-bot/callback"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bot_whitelist.json")

class MaoBot:
    def __init__(self, log=None):
        self.running = False
        self.log = log or print
        self.last_msg = ""
        self.contact = ""
        self.load_config()
        
    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE) as f:
                c = json.load(f)
                self.contact = list(c.get("whitelist", []))[0] if c.get("whitelist") else ""
    
    def save_config(self, name):
        with open(CONFIG_FILE, "w") as f:
            json.dump({"whitelist": [name]}, f)

    def delay(self, sec=None):
        time.sleep(sec or random.uniform(0.5, 1.5))
    
    def open_chat(self, name):
        """Ctrl+F搜索并打开聊天"""
        import uiautomation as auto
        wx = auto.WindowControl(Name="微信")
        if not wx.Exists(3):
            self.log("微信窗口未找到")
            return False
        wx.SetActive()
        self.delay(0.3)
        wx.SendKeys("{Ctrl}f")
        self.delay(0.5)
        pyperclip.copy(name)
        wx.SendKeys("{Ctrl}v")
        self.delay(0.5)
        wx.SendKeys("{Enter}")
        self.delay(1)
        return True

    def get_new_message(self):
        """双击最后一条消息→Ctrl+C复制→读取"""
        import uiautomation as auto
        try:
            wx = auto.WindowControl(Name="微信")
            if not wx.Exists(2): return None
            
            # 点击聊天区域中间偏下（最后消息的位置）
            rect = wx.BoundingRectangle
            # 聊天区域大约在窗口的中间偏下位置
            x = rect.left + rect.width() // 2
            y = rect.bottom - 150
            
            wx.Click(x=x, y=y)
            self.delay(0.2)
            # 双击选中消息
            wx.Click(x=x, y=y)
            self.delay(0.1)
            wx.Click(x=x, y=y)
            self.delay(0.2)
            
            # Ctrl+C复制
            wx.SendKeys("{Ctrl}c")
            self.delay(0.3)
            
            text = pyperclip.paste()
            if not text or text == self.last_msg: return None
            
            self.last_msg = text
            return text
        except Exception as e:
            self.log(f"[读取错误] {e}")
            return None

    def send_reply(self, text):
        """粘贴并发送回复"""
        import uiautomation as auto
        try:
            wx = auto.WindowControl(Name="微信")
            if not wx.Exists(2): return False
            
            pyperclip.copy(text)
            wx.SendKeys("{Ctrl}v")
            self.delay(0.3)
            wx.SendKeys("{Enter}")
            self.log(f"[发送] {text[:80]}")
            self.delay(random.uniform(1, 3))
            return True
        except Exception as e:
            self.log(f"[发送错误] {e}")
            return False

    def call_api(self, msg):
        try:
            r = requests.post(CAT_HERO_URL, json={"wxid": self.contact, "msg": msg}, timeout=10)
            return r.json().get("reply")
        except: return None

    def monitor(self, contact):
        self.running = True
        self.contact = contact
        self.log(f"开始监控 {contact}")
        self.log("收到新消息会自动回复")
        
        if not self.open_chat(contact):
            self.log("请手动打开聊天窗口后重试")
            return
        
        while self.running:
            try:
                msg = self.get_new_message()
                if msg and len(msg) > 1:
                    self.log(f"[收到] {msg[:60]}")
                    reply = self.call_api(msg)
                    if reply:
                        self.send_reply(reply)
                time.sleep(3)
            except: time.sleep(5)
    
    def stop(self):
        self.running = False


class GUI:
    def __init__(self):
        self.bot = MaoBot(log=self.add_log)
        self.win = tk.Tk()
        self.win.title("猫猫侠微信机器人 v3.0")
        self.win.geometry("500x420")
        
        tk.Label(self.win, text="猫猫侠微信机器人", font=("微软雅黑", 14, "bold")).pack(pady=10)
        tk.Label(self.win, text="键盘操作版 · 无需Hook · 最稳定", fg="gray").pack()
        
        f1 = tk.Frame(self.win); f1.pack(pady=10)
        tk.Label(f1, text="大号昵称:").pack(side=tk.LEFT)
        self.name_var = tk.StringVar(value=self.bot.contact)
        self.name_ent = tk.Entry(f1, textvariable=self.name_var, width=20)
        self.name_ent.pack(side=tk.LEFT, padx=5)
        
        f2 = tk.Frame(self.win); f2.pack(pady=5)
        self.btn1 = tk.Button(f2, text="开始监控", command=self.start, bg="#07C160", fg="white", width=12)
        self.btn1.pack(side=tk.LEFT, padx=5)
        self.btn2 = tk.Button(f2, text="停止", command=self.stop, state=tk.DISABLED, width=12)
        self.btn2.pack(side=tk.LEFT, padx=5)
        
        self.log_area = scrolledtext.ScrolledText(self.win, height=14, state=tk.DISABLED, font=("Consolas", 9))
        self.log_area.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.add_log("准备就绪。输入大号昵称，点击开始。")
        self.add_log("请确保微信已登录，并手动打开和目标联系人的聊天窗口。")
    
    def add_log(self, text):
        self.log_area.config(state=tk.NORMAL)
        self.log_area.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {text}\n")
        self.log_area.see(tk.END)
        self.log_area.config(state=tk.DISABLED)
    
    def start(self):
        name = self.name_var.get().strip()
        if not name:
            messagebox.showwarning("提示", "请输入大号微信昵称")
            return
        self.bot.save_config(name)
        self.btn1.config(state=tk.DISABLED)
        self.btn2.config(state=tk.NORMAL)
        self.name_ent.config(state=tk.DISABLED)
        threading.Thread(target=self.bot.monitor, args=(name,), daemon=True).start()
    
    def stop(self):
        self.bot.stop()
        self.btn1.config(state=tk.NORMAL)
        self.btn2.config(state=tk.DISABLED)
        self.name_ent.config(state=tk.NORMAL)
        self.add_log("已停止")
    
    def run(self):
        self.win.protocol("WM_DELETE_WINDOW", lambda: (self.bot.stop(), self.win.destroy()))
        self.win.mainloop()

if __name__ == "__main__":
    GUI().run()
