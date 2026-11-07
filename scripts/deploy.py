#!/usr/bin/env python3
"""
life.maomaoxia.top 部署脚本（群晖 NAS + Docker Compose）

凭据从环境变量读取，不要把密码写进本文件：
    export NAS_HOST=192.168.68.161
    export NAS_USER=maomaoxia
    export NAS_PASS=******

用法：
    python scripts/deploy.py all        # 一键：构建前端 → 上传 → 构建镜像 → 重建容器 → 健康检查
    python scripts/deploy.py build      # 只构建前端（本机，产物进 dist/）
    python scripts/deploy.py upload     # 只上传代码（不重启服务）
    python scripts/deploy.py image      # 只在 NAS 上构建镜像
    python scripts/deploy.py restart    # 只重建容器（用现有镜像）
    python scripts/deploy.py rollback   # 回滚到上一版容器

依赖：pip install paramiko
"""

import base64
import hashlib
import io
import os
import subprocess
import sys
import tarfile
import time

try:
    import paramiko
except ImportError:
    sys.exit("缺少依赖：pip install paramiko")

HOST = os.environ.get("NAS_HOST", "192.168.68.161")
USER = os.environ.get("NAS_USER", "maomaoxia")
PWD = os.environ.get("NAS_PASS", "")
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE_DIR = "/volume1/projects/cat-hero-life"
STAGE = "/volume1/docker/_deploy_staging"
DOCKER = "/var/packages/ContainerManager/target/usr/bin/docker"
CONTAINER = "cat-hero-life"
TAG = os.environ.get("TAG", "2.0.0")

HEALTH_URL = f"http://127.0.0.1:3000/api/system/health"


# --------------------------------------------------------------------------- #
# 远端执行
# --------------------------------------------------------------------------- #
def connect():
    if not PWD:
        sys.exit("请先设置 NAS_PASS 环境变量")
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, 22, USER, PWD, timeout=15, look_for_keys=False, allow_agent=False)
    return cli


def run(cli, cmd, timeout=1800, quiet=False):
    # 群晖 sudo 无 TTY，密码必须由 stdin 喂入；-p '' 去掉提示符避免污染输出
    full = f"sudo -S -p '' bash -c {cmd!r}"
    stdin, stdout, stderr = cli.exec_command(full, timeout=timeout)
    stdin.write(PWD + "\n")
    stdin.flush()
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    err = "\n".join(l for l in err.splitlines() if "chdir to home directory" not in l)
    if not quiet:
        if out.strip():
            print(out.strip())
        if err.strip():
            print("[stderr]", err.strip()[:1500])
    return out, err


# --------------------------------------------------------------------------- #
# 步骤
# --------------------------------------------------------------------------- #
def step_build():
    print("[1] 构建前端 ...")
    r = subprocess.run(
        ["npm", "run", "build"], cwd=os.path.join(REPO, "frontend"),
        shell=(os.name == "nt"), capture_output=True, text=True, encoding="utf-8", errors="ignore",
    )
    tail = (r.stdout or "")[-600:]
    print(tail.strip())
    if r.returncode != 0:
        print((r.stderr or "")[-1200:])
        sys.exit("!! 前端构建失败")
    print("    ✓ 构建完成")


def build_tarball():
    print("[2] 打包部署文件 ...")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name in ("Dockerfile", "docker-compose.yml", "package.json", "package-lock.json"):
            p = os.path.join(REPO, name)
            if os.path.exists(p):
                t.add(p, arcname=name)
        for d in ("server", "dist"):
            root_dir = os.path.join(REPO, d)
            for root, dirs, files in os.walk(root_dir):
                dirs[:] = [x for x in dirs if x not in ("node_modules", "__pycache__")]
                for f in files:
                    if f.startswith(".") or ".bak_" in f:
                        continue
                    fp = os.path.join(root, f)
                    t.add(fp, arcname=os.path.relpath(fp, REPO))
    data = buf.getvalue()
    print(f"    {len(data)/1048576:.2f} MB  md5={hashlib.md5(data).hexdigest()}")
    return data


def step_upload(cli):
    data = build_tarball()
    print("[3] 上传 ...")
    remote_tar = f"{STAGE}/release-{TAG}.tar.gz"
    b64 = base64.b64encode(data).decode()
    # 分块写：群晖单块 tee 写大文件会被截断（历史踩坑）
    CH = 100_000
    run(cli, f"mkdir -p {STAGE}; rm -f {remote_tar}.b64", quiet=True)
    for i in range(0, len(b64), CH):
        op = ">" if i == 0 else ">>"
        run(cli, f"printf '%s' '{b64[i:i+CH]}' {op} {remote_tar}.b64", quiet=True)
    run(cli, f"base64 -d {remote_tar}.b64 > {remote_tar} && rm -f {remote_tar}.b64", quiet=True)

    out, _ = run(cli, f"md5sum {remote_tar} | cut -d' ' -f1", quiet=True)
    if out.strip() != hashlib.md5(data).hexdigest():
        sys.exit("!! 上传校验失败")
    print("    ✓ 校验通过")

    # 保留上一版，便于回滚
    run(cli, f"rm -rf {REMOTE_DIR}/_old; mkdir -p {REMOTE_DIR}/_old; "
             f"cd {REMOTE_DIR} && cp -a server dist Dockerfile docker-compose.yml "
             f"package.json package-lock.json _old/ 2>/dev/null; true", quiet=True)
    run(cli, f"cd {REMOTE_DIR} && rm -rf server dist && tar xzf {remote_tar} -C {REMOTE_DIR} "
             f"&& echo '    解压完成'", quiet=True)
    print("    ✓ 代码已就位")


def step_image(cli):
    print("[4] 在 NAS 构建镜像 ...")
    # 必须显式捕获退出码：docker build 失败时 bash -c 仍可能返回 0，
    # 之前正是因为没检查，构建失败却打印「✓ 构建完成」，险些把旧镜像当新镜像上线
    log = f"{STAGE}/build.log"
    out, _ = run(cli, f"cd {REMOTE_DIR} && {DOCKER} build -t {CONTAINER}:{TAG} . "
                      f"> {log} 2>&1; echo EXIT=$?; tail -25 {log}", timeout=2400, quiet=True)
    print(out.strip())
    if "EXIT=0" not in out:
        sys.exit("!! 镜像构建失败，已中止（未改动运行中的容器）")
    print(f"    ✓ {CONTAINER}:{TAG}")


def step_restart(cli, wait=40):
    print("[5] 重建容器 ...")
    # 记录当前容器 ID 以便回滚
    run(cli, f"{DOCKER} rm -f {CONTAINER}-previous 2>/dev/null; "
             f"{DOCKER} rename {CONTAINER} {CONTAINER}-previous 2>/dev/null; true", quiet=True)
    run(cli, f"cd {REMOTE_DIR} && {DOCKER} compose up -d --force-recreate 2>&1 | tail -8")

    print("[6] 健康检查 ...")
    for i in range(1, wait // 2 + 1):
        code, _ = run(cli, f"curl -sS -m 3 -o /dev/null -w '%{{http_code}}' {HEALTH_URL}", quiet=True)
        print(f"    {i:>2}: {code.strip() or '-'}")
        if code.strip() == "200":
            print("    ✓ 服务已就绪")
            run(cli, f"{DOCKER} rm -f {CONTAINER}-previous 2>/dev/null; true", quiet=True)
            return True
        time.sleep(2)

    print("    !! 健康检查失败，自动回滚")
    step_rollback(cli)
    sys.exit("部署失败，已回滚")


def step_rollback(cli):
    print("回滚 ...")
    run(cli, f"{DOCKER} rm -f {CONTAINER} 2>/dev/null; "
             f"{DOCKER} rename {CONTAINER}-previous {CONTAINER} 2>/dev/null; "
             f"{DOCKER} start {CONTAINER} 2>/dev/null; true")


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    cli = connect()
    try:
        if step == "build":
            step_build()
        elif step == "upload":
            step_upload(cli)
        elif step == "image":
            step_image(cli)
        elif step == "restart":
            step_restart(cli)
        elif step == "rollback":
            step_rollback(cli)
        elif step == "all":
            step_build()
            step_upload(cli)
            step_image(cli)
            step_restart(cli)
            print("\n✓ 部署完成")
        else:
            sys.exit(f"未知步骤: {step}")
    finally:
        cli.close()


if __name__ == "__main__":
    main()
