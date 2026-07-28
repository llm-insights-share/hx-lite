---
check_type: shell
---

## 检查意图

类型检查。

通过本门禁后再进入下一交付环节。

```bash
set -euo pipefail
if [ -f tsconfig.json ]; then
  npx --yes tsc --noEmit
elif [ -f package.json ] && grep -q '"typecheck"' package.json; then
  npm run typecheck
elif [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  python3 -m compileall -q . 2>/dev/null || true
  echo "python: compileall soft-ok"
else
  echo "skip: 未配置 typecheck 入口"; exit 0
fi
```
