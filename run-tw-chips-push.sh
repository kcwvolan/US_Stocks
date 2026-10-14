#!/bin/bash
# Wrapper for launchd — 設定 PATH 後執行
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

NODE=$(which node 2>/dev/null || echo "/usr/local/bin/node")
cd /Users/kcw/Documents/AI_Workplace/US_Stocks
exec "$NODE" scripts/discord-tw-chips-push.js >> /Users/kcw/Documents/AI_Workplace/US_Stocks/discord-tw-chips-push.log 2>&1
