#!/bin/sh

# 定义端口和路径
PORT=45775
WORK_DIR="/usr/home/YOUR_USERNAME/domains/YOUR_DOMAIN/backend"
ENTRY_POINT="index.js"

# 检查端口是否被监听
sockstat -4 -l | grep ":$PORT" > /dev/null

if [ $? -ne 0 ]; then
    echo "$(date): 服务未运行，正在启动..." >> "$WORK_DIR/restart.log"
    cd "$WORK_DIR"
    # 使用 nohup 后台运行
    /usr/local/bin/node "$ENTRY_POINT" > server.log 2>&1 &
fi