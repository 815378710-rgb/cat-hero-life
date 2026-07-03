# WeChat-Hook 部署指南

## 1. 下载微信 4.1.10.27
- 下载地址: https://github.com/tom-snow/wechat-windows-versions/releases
- 或使用官方微信安装包（必须匹配 4.1.10.27 版本）

## 2. 安装 version.dll
将 `wechat-hook/version.dll` 复制到微信安装目录:
```
C:\Program Files\Tencent\Weixin\
```

## 3. 启动微信
启动微信后，DLL 会自动加载，在 127.0.0.1:30001 启动 HTTP 服务。

验证: 浏览器访问 http://127.0.0.1:30001/QueryDB/status
返回 {"IsLogin":0} 表示服务正常，扫码登录后 IsLogin 变为 1。

## 4. 配置猫猫侠连接
在猫猫侠的 .env 或启动命令中设置:
```
WECHAT_HOST=192.168.xxx.xxx   # Windows机器内网IP
WECHAT_PORT=30001
```

## 5. 绑定微信
在猫猫侠中绑定微信账号:
```
POST /api/wechat-bot/bind
Body: {"wxid": "你的wxid"}
```

查看你的wxid:
```
POST http://127.0.0.1:30001/GetSelfProfile
```

## 防封要点
- 新设备前2天会自动限流（每天最多10条）
- 消息间隔 2-5秒（模拟真人）
- 每小时最多60条，每天最多200条
- 回复前1-4秒随机延迟
- 同省份登录更稳定（Gewechat经验）
