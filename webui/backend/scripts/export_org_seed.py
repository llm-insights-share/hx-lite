#!/usr/bin/env python3
"""Export current SQLite org catalog + projects into backend/seed/org-default."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlmodel import Session  # noqa: E402

from app.core.db import engine  # noqa: E402
from app.domain.org_seed import SEED_DIR, export_org_seed  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--org-id", default="default")
    parser.add_argument(
        "--dest",
        type=Path,
        default=None,
        help=f"Output directory (default: {SEED_DIR})",
    )
    args = parser.parse_args()
    with Session(engine) as session:
        manifest = export_org_seed(session, org_id=args.org_id, dest=args.dest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
