#!/bin/bash
# 安裝 launchd 排程（Mac 喚醒後自動補跑）
# 用法：bash setup-launchd.sh
set -u

AGENT_DIR="$HOME/Library/LaunchAgents"
SCRIPT_DIR="/Users/kcw/Documents/AI_Workplace/US_Stocks"
LABELS=("com.kcw.discord-market-push" "com.kcw.discord-watchlist-push")
UID_NUM="$(id -u)"

fail() { echo "❌ $1" >&2; exit 1; }

mkdir -p "$AGENT_DIR" || fail "無法建立 $AGENT_DIR"
[ -w "$AGENT_DIR" ] || fail "$AGENT_DIR 不可寫入（擁有者：$(stat -f %Su "$AGENT_DIR")）。請執行：sudo chown \"$(id -un)\":staff \"$AGENT_DIR\""

# 先移除舊 cron（若有）
crontab -l 2>/dev/null | grep -v "discord-push.js" | crontab - 2>/dev/null
echo "🧹 已清除舊 cron 排程"

# 賦予執行權限
chmod +x "$SCRIPT_DIR/run-market-push.sh" "$SCRIPT_DIR/run-watchlist-push.sh" || fail "chmod 失敗"

for L in "${LABELS[@]}"; do
  SRC="$SCRIPT_DIR/$L.plist"
  DST="$AGENT_DIR/$L.plist"
  [ -f "$SRC" ] || fail "找不到 $SRC"
  cp "$SRC" "$DST" || fail "複製 $L.plist 失敗"
  plutil -lint "$DST" >/dev/null || fail "$L.plist 格式錯誤"

  # 卸載舊的（忽略不存在的錯誤），再載入
  launchctl bootout "gui/$UID_NUM/$L" 2>/dev/null
  launchctl enable "gui/$UID_NUM/$L" 2>/dev/null
  launchctl bootstrap "gui/$UID_NUM" "$DST" || fail "載入 $L 失敗"
done

echo ""
echo "── 驗證已載入 ───────────────────────────"
OK=1
for L in "${LABELS[@]}"; do
  if launchctl list | grep -q "$L"; then
    echo "✅ $L"
  else
    echo "❌ $L 未出現在 launchctl list"; OK=0
  fi
done
echo "─────────────────────────────────────────"
[ "$OK" = 1 ] || fail "有排程未成功載入"

echo ""
echo "✅ launchd 排程已安裝："
echo "   18:00  高量能市場雷達報告    (discord-push.js)"
echo "   18:10  Watchlist 16支深度分析 (discord-watchlist-push.js)"
echo "特性：Mac 喚醒後如錯過時間，會立即補跑一次"
echo "日誌："
echo "  $SCRIPT_DIR/discord-push.log"
echo "  $SCRIPT_DIR/discord-watchlist-push.log"
