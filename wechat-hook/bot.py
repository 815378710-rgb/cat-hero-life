# 猫猫侠微信机器人 - 基于 wxhook
# 只响应指定联系人，防封设计，稳定运行

import os
import sys
import time
import json
import random
import requests
from datetime import datetime
from wxhook import Bot, events
from wxhook.model import Event

# ===== 配置 =====
CAT_HERO_API = "http://127.0.0.1:3000/api"  # 猫猫侠API地址（NAS改成实际IP）
WHITELIST_WXID = ""  # 留空自动学习，或手动指定只回复谁
CAT_HERO_HOST = "127.0.0.1"  # 猫猫侠服务器IP

class MaoMaoXiaBot:
    def __init__(self):
        self.my_wxid = None
        self.whitelist = set()
        self.msg_count = {"hour": 0, "day": 0}
        self.last_hour_reset = time.time()
        self.last_day_reset = time.time()
        self.last_msg_time = 0
        self.start_time = time.time()
        
    def load_config(self):
        """从文件加载配置"""
        config_file = os.path.join(os.path.dirname(__file__), "bot_config.json")
        if os.path.exists(config_file):
            with open(config_file, "r") as f:
                config = json.load(f)
                self.whitelist = set(config.get("whitelist", []))
                if config.get("whitelist_wxid"):
                    self.whitelist.add(config["whitelist_wxid"])
    
    def save_config(self):
        config_file = os.path.join(os.path.dirname(__file__), "bot_config.json")
        config = {"whitelist": list(self.whitelist)}
        with open(config_file, "w") as f:
            json.dump(config, f, indent=2)
    
    def check_rate_limit(self):
        """防封：消息频率限制"""
        now = time.time()
        
        # 小时重置
        if now - self.last_hour_reset > 3600:
            self.msg_count["hour"] = 0
            self.last_hour_reset = now
        
        # 天重置
        if now - self.last_day_reset > 86400:
            self.msg_count["day"] = 0
            self.last_day_reset = now
        
        # 新设备冷却（前2小时限制）
        hours_since_start = (now - self.start_time) / 3600
        if hours_since_start < 2 and self.msg_count["day"] > 10:
            print(f"[防封] 新设备冷却中，跳过...")
            return False
        
        # 小时限额
        if self.msg_count["hour"] >= 30:
            print(f"[防封] 小时限额已达")
            return False
        
        # 天限额
        if self.msg_count["day"] >= 100:
            print(f"[防封] 日限额已达")
            return False
        
        # 最小间隔 2-5秒随机
        elapsed = now - self.last_msg_time
        min_wait = max(0, 2 - elapsed)
        random_wait = random.uniform(1, 3)
        if min_wait + random_wait > 0:
            time.sleep(min_wait + random_wait)
        
        self.msg_count["hour"] += 1
        self.msg_count["day"] += 1
        self.last_msg_time = time.time()
        return True
    
    def call_cat_hero(self, endpoint, data=None):
        """调用猫猫侠API"""
        try:
            url = f"{CAT_HERO_API}{endpoint}"
            if data:
                resp = requests.post(url, json=data, timeout=10)
            else:
                resp = requests.get(url, timeout=10)
            return resp.json()
        except Exception as e:
            print(f"[API] 调用失败: {e}")
            return None
    
    def on_login(self, bot: Bot, event: Event):
        """微信登录成功"""
        print(f"[登录] 微信已登录")
        # 获取自己的wxid
        try:
            profile = self.call_cat_hero("/wechat-bot/hook-status")
            self.my_wxid = bot.get_self_info().get("wxid", "")
        except:
            pass
        
        # 加载白名单
        self.load_config()
        
        # 通知猫猫侠
        print(f"[绑定] wxid={self.my_wxid}")
        if self.my_wxid:
            result = self.call_cat_hero("/wechat-bot/bind", {"wxid": self.my_wxid})
            print(f"[绑定] 结果: {result}")
    
    def on_message(self, bot: Bot, event: Event):
        """收到消息"""
        sender = event.get("sender", "")
        content = event.get("content", "")
        msg_type = event.get("type", 1)
        
        # 只处理文本消息
        if msg_type != 1:
            return
        
        # 白名单检查
        if not self.whitelist:
            # 自动学习：收到的第一条消息的发送者加入白名单
            self.whitelist.add(sender)
            self.save_config()
            print(f"[白名单] 自动添加: {sender}")
            bot.send_text(sender, "猫猫侠已上线，我是你的AI助手 🐱\n\n发送「状态」查看数据\n发送「打卡 xxx」记录打卡\n直接聊天也可以~")
            self.msg_count["day"] += 1
            self.last_msg_time = time.time()
            return
        
        if sender not in self.whitelist:
            return  # 忽略非白名单消息
        
        print(f"[消息] {sender}: {content}")
        
        # 转发到猫猫侠处理
        result = self.call_cat_hero("/wechat-bot/callback", {
            "wxid": sender,
            "msg": content
        })
        
        if result and result.get("reply"):
            if self.check_rate_limit():
                bot.send_text(sender, result["reply"])
        elif result and result.get("handled"):
            if self.check_rate_limit():
                # 猫猫侠处理了但没有回复，给个默认回复
                bot.send_text(sender, "收到~ 🐱")


def main():
    print("=" * 50)
    print("  猫猫侠微信机器人 v1.0")
    print("  基于 wxhook 框架")
    print("=" * 50)
    print()
    
    mao_bot = MaoMaoXiaBot()
    
    bot = Bot(
        faked_version="3.9.10.19",
        on_login=mao_bot.on_login,
        on_start=lambda b: print("[启动] 微信已启动"),
        on_stop=lambda b: print("[停止] 微信已关闭"),
    )
    
    @bot.handle(events.TEXT_MESSAGE)
    def handle_text(bot: Bot, event: Event):
        try:
            mao_bot.on_message(bot, event)
        except Exception as e:
            print(f"[错误] {e}")
    
    print("[运行] 正在启动微信...")
    bot.run()


if __name__ == "__main__":
    main()
