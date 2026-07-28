---
check_type: shell
---

## 检查意图

静态检查 / Lint。

通过本门禁后再进入下一交付环节。

```bash
set -euo pipefail
if [ -f package.json ] && grep -q '"lint"' package.json; then
  npm run lint
elif command -v ruff >/dev/null 2>&1; then
  ruff check .
else
  echo "skip: 未配置 lint 脚本"; exit 0
fi
```
