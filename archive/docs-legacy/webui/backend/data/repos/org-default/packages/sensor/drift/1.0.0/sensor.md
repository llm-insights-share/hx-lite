---
check_type: shell
---

## 检查意图

实现与规格漂移探测（轻量）。

通过本门禁后再进入下一交付环节。

```bash
set -euo pipefail
if [ ! -d openspec ] && [ ! -d harnessX ] && [ ! -d docs ]; then
  echo "缺少 docs/openspec/harnessX"; exit 1
fi
if [ ! -d src ] && [ ! -d packages ] && [ ! -d app ] && [ ! -d webui ]; then
  echo "缺少常见源码目录（src/packages/app/webui 之一）"; exit 1
fi
echo "drift soft-check ok"
```
