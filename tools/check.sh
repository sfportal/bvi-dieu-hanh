#!/usr/bin/env bash
# Dựng lại index.html rồi kiểm tra cú pháp JavaScript. Chạy: bash tools/check.sh
set -e
cd "$(dirname "$0")"
python3 build.py
python3 - <<'PY'
import re
s=open('../index.html').read()
js=max(re.findall(r'<script>([\s\S]*?)</script>',s),key=len)
open('/tmp/bvi_main_check.js','w').write(js)
PY
node --check /tmp/bvi_main_check.js && echo "OK: cú pháp JavaScript hợp lệ"
