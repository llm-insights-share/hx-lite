"""GitHub / local-git push and dry-run helpers."""

from __future__ import annotations

import base64
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import httpx
from git import Actor, Repo
from git.exc import GitCommandError, InvalidGitRepositoryError

from app.core.config import get_settings


@dataclass
class GitResult:
    ok: bool
    message: str
    commit_sha: str = ""
    diff_text: str = ""
    remote: str = ""
    branch: str = ""


@dataclass
class RepoSkill:
    """A directory in a GitHub repo that contains SKILL.md."""

    id: str
    path: str
    skill_md_path: str


def _auth_url(remote: str, token: str) -> str:
    token = (token or "").strip()
    if not token or not remote.startswith("https://"):
        return remote
    rest = remote[len("https://") :]
    if "@" in rest.split("/", 1)[0]:
        return remote
    return f"https://x-access-token:{quote(token, safe='')}@{rest}"


def parse_github_owner_repo(remote: str) -> tuple[str, str] | None:
    text = (remote or "").strip()
    if not text:
        return None
    m = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+)", text)
    if m:
        return m.group("owner"), m.group("repo")
    # bare owner/repo
    m2 = re.fullmatch(r"(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+)", text)
    if m2:
        return m2.group("owner"), m2.group("repo").removesuffix(".git")
    return None


def _github_api_headers(token: str | None = None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    tok = (token or "").strip()
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    return headers


def _api_error_message(res: httpx.Response) -> str:
    try:
        if res.headers.get("content-type", "").startswith("application/json"):
            return str(res.json().get("message") or res.text)
    except Exception:  # noqa: BLE001
        pass
    return res.text or f"HTTP {res.status_code}"


def resolve_default_branch(owner: str, repo: str, token: str | None = None) -> str:
    headers = _github_api_headers(token)
    with httpx.Client(timeout=30.0) as client:
        res = client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=headers)
        if res.status_code != 200:
            raise RuntimeError(f"无法读取仓库 {owner}/{repo}: {_api_error_message(res)}")
        return str(res.json().get("default_branch") or "main")


def list_repo_skills(
    owner: str,
    repo: str,
    token: str | None = None,
    ref: str | None = None,
) -> list[RepoSkill]:
    """List directories that contain SKILL.md via the recursive git tree API."""
    headers = _github_api_headers(token)
    tree_ref = (ref or "").strip() or resolve_default_branch(owner, repo, token)
    with httpx.Client(timeout=60.0) as client:
        res = client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{quote(tree_ref, safe='')}?recursive=1",
            headers=headers,
        )
        if res.status_code != 200:
            raise RuntimeError(f"列出仓库文件失败: {_api_error_message(res)}")
        body = res.json()
        if body.get("truncated"):
            raise RuntimeError("仓库文件树过大（truncated），请缩小仓库或指定更具体的 ref")
        tree = body.get("tree") or []

    skills: list[RepoSkill] = []
    seen: set[str] = set()
    for item in tree:
        if item.get("type") != "blob":
            continue
        path = str(item.get("path") or "").replace("\\", "/")
        if not path.lower().endswith("/skill.md") and path.lower() != "skill.md":
            continue
        # only exact SKILL.md filename (case-insensitive match already via endswith)
        name = path.rsplit("/", 1)[-1]
        if name.lower() != "skill.md":
            continue
        dir_path = path.rsplit("/", 1)[0] if "/" in path else ""
        skill_id = dir_path.rsplit("/", 1)[-1] if dir_path else "skill"
        # Use "." for repo-root skill so the path is always non-empty for UI select
        store_path = dir_path or "."
        if not skill_id or store_path in seen:
            continue
        seen.add(store_path)
        if _is_task_skill_shell(skill_id, store_path, path):
            continue
        skills.append(RepoSkill(id=skill_id, path=store_path, skill_md_path=path))
    skills.sort(key=lambda s: s.path.lower())
    return skills


def _is_task_skill_shell(skill_id: str, store_path: str, skill_md_path: str) -> bool:
    """Task shells live in CommandShell / skill-shells — not as Guide skills."""
    import re

    p = f"{store_path}/{skill_md_path}".replace("\\", "/").lower()
    if "skill-shells/" in p or p.startswith("skill-shells/") or "/.cursor/commands/" in f"/{p}":
        return True
    if "/.cursor/commands/" in f"/{store_path.lower()}/":
        return True
    sid = (skill_id or "").strip()
    if re.match(r"^(hx|nhx)-", sid, re.I) or sid.lower().startswith("wf-"):
        return True
    return False


def fetch_repo_subtree_files(
    owner: str,
    repo: str,
    dir_path: str,
    token: str | None = None,
    ref: str | None = None,
) -> dict[str, bytes]:
    """Download all files under dir_path; keys are paths relative to that directory."""
    headers = _github_api_headers(token)
    tree_ref = (ref or "").strip() or resolve_default_branch(owner, repo, token)
    raw = (dir_path or "").replace("\\", "/").strip("/")
    # "." means skill package lives at repository root (only top-level files)
    prefix = "" if raw in ("", ".") else raw
    with httpx.Client(timeout=60.0) as client:
        res = client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{quote(tree_ref, safe='')}?recursive=1",
            headers=headers,
        )
        if res.status_code != 200:
            raise RuntimeError(f"列出仓库文件失败: {_api_error_message(res)}")
        body = res.json()
        if body.get("truncated"):
            raise RuntimeError("仓库文件树过大（truncated），无法完整下载 skill 包")
        tree = body.get("tree") or []

        blobs: list[tuple[str, str]] = []  # (rel_path, sha)
        for item in tree:
            if item.get("type") != "blob":
                continue
            full = str(item.get("path") or "").replace("\\", "/")
            if prefix:
                if full == prefix or not full.startswith(prefix + "/"):
                    continue
                rel = full[len(prefix) + 1 :]
            else:
                # root skill: only files directly under repo root
                if "/" in full:
                    continue
                rel = full
            if not rel or ".." in rel.split("/"):
                continue
            sha = item.get("sha")
            if not sha:
                continue
            blobs.append((rel, sha))

        if not blobs:
            raise RuntimeError(f"目录为空或不存在: {raw or '/'}")

        files: dict[str, bytes] = {}
        for rel, sha in blobs:
            blob = client.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/blobs/{sha}",
                headers={**headers, "Accept": "application/vnd.github.raw"},
            )
            if blob.status_code != 200:
                # fallback: json + base64
                blob2 = client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/git/blobs/{sha}",
                    headers=headers,
                )
                if blob2.status_code != 200:
                    raise RuntimeError(f"下载文件失败 {rel}: {_api_error_message(blob)}")
                data = blob2.json()
                if data.get("encoding") == "base64":
                    files[rel] = base64.b64decode(data.get("content") or "")
                else:
                    files[rel] = (data.get("content") or "").encode("utf-8")
            else:
                files[rel] = blob.content
        return files


def check_github_contents_write(token: str, remote: str) -> GitResult:
    """Preflight: fine-grained PATs need Contents: Read and write for git push."""
    token = (token or "").strip()
    if not token:
        return GitResult(
            ok=False,
            message="GitHub Token 未配置：请在组织设置中填写，或设置环境变量 HX_WEBUI_GITHUB_TOKEN",
            remote=remote,
        )
    parsed = parse_github_owner_repo(remote)
    if not parsed:
        return GitResult(ok=False, message=f"无法解析 GitHub 仓库地址: {remote}", remote=remote)
    owner, repo = parsed
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            user = client.get("https://api.github.com/user", headers=headers)
            if user.status_code != 200:
                msg = (
                    user.json().get("message")
                    if user.headers.get("content-type", "").startswith("application/json")
                    else user.text
                )
                return GitResult(
                    ok=False,
                    message=f"GitHub Token 无效或无权限登录 API（HTTP {user.status_code}）: {msg}",
                    remote=remote,
                )

            blob = client.post(
                f"https://api.github.com/repos/{owner}/{repo}/git/blobs",
                headers=headers,
                json={"content": "hx-webui-write-preflight", "encoding": "utf-8"},
            )
            if blob.status_code in (200, 201):
                return GitResult(ok=True, message="contents write ok", remote=remote)
            body = blob.json() if blob.headers.get("content-type", "").startswith("application/json") else {}
            api_msg = body.get("message") or blob.text
            # Empty repos reject git Data API with 409; initial git push is still correct.
            if blob.status_code == 409 and "empty" in str(api_msg).lower():
                return GitResult(ok=True, message="empty repo — allow initial push", remote=remote)
            if blob.status_code == 403 or "not accessible by personal access token" in str(api_msg).lower():
                return GitResult(
                    ok=False,
                    message=(
                        "GitHub Token 无仓库写权限（Contents）。"
                        "若使用 Fine-grained PAT：打开 Token 设置，为该仓库勾选 "
                        "Repository permissions → Contents: Read and write（建议同时 Metadata: Read），保存后再推送。"
                        f" API: {api_msg}"
                    ),
                    remote=remote,
                )
            return GitResult(
                ok=False,
                message=f"GitHub 写权限预检失败（HTTP {blob.status_code}）: {api_msg}",
                remote=remote,
            )
    except Exception as exc:  # noqa: BLE001
        return GitResult(ok=False, message=f"GitHub 预检异常: {exc}", remote=remote)


def ensure_repo(workdir: Path, remote: str, branch: str, token: str) -> Repo:
    workdir.mkdir(parents=True, exist_ok=True)
    try:
        repo = Repo(workdir)
    except InvalidGitRepositoryError:
        repo = Repo.init(workdir)

    auth = _auth_url(remote, token) if remote else ""
    if remote:
        names = [r.name for r in repo.remotes]
        if "origin" in names:
            repo.remotes.origin.set_url(auth)
        else:
            repo.create_remote("origin", auth)

    try:
        repo.git.checkout("-B", branch)
    except GitCommandError:
        pass
    return repo


def sync_directory_into_repo(source: Path, workdir: Path) -> None:
    workdir.mkdir(parents=True, exist_ok=True)
    for child in list(workdir.iterdir()):
        if child.name == ".git":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    if not source.exists():
        return
    for item in source.iterdir():
        dest = workdir / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)


def dry_run_diff(workdir: Path, remote: str, branch: str, token: str, source: Path | None = None) -> GitResult:
    try:
        if source:
            sync_directory_into_repo(source, workdir)
        repo = ensure_repo(workdir, remote, branch, (token or "").strip())
        repo.git.add(A=True)
        diff = repo.git.diff("--cached") or repo.git.diff()
        status = repo.git.status("--short")
        text = (diff or "") + ("\n\n# status\n" + status if status else "")
        return GitResult(
            ok=True,
            message="dry-run ok",
            diff_text=text or "(no changes)",
            remote=remote,
            branch=branch,
        )
    except Exception as exc:  # noqa: BLE001
        return GitResult(ok=False, message=str(exc), remote=remote, branch=branch)


def _friendly_push_error(exc: Exception) -> str:
    text = str(exc)
    lower = text.lower()
    if "403" in text or "permission" in lower or "denied" in lower:
        return (
            f"{text}\n\n排查：当前 Fine-grained PAT 能登录，但 git push 被拒绝。"
            "请为仓库授予 Contents: Read and write 后重试；经典 PAT 需勾选 repo 权限。"
        )
    return text


def commit_and_push(
    workdir: Path,
    remote: str,
    branch: str,
    token: str,
    message: str,
    source: Path | None = None,
) -> GitResult:
    settings = get_settings()
    tok = (token or settings.github_token or "").strip()

    pre = check_github_contents_write(tok, remote)
    if not pre.ok:
        return GitResult(ok=False, message=pre.message, remote=remote, branch=branch)

    try:
        if source:
            sync_directory_into_repo(source, workdir)
        repo = ensure_repo(workdir, remote, branch, tok)
        repo.git.add(A=True)

        dirty = bool(repo.git.status("--porcelain"))
        sha = ""
        if dirty:
            author = Actor("HX WebUI", "hx-webui@local")
            commit = repo.index.commit(message, author=author, committer=author)
            sha = commit.hexsha
        else:
            try:
                sha = repo.head.commit.hexsha
            except Exception:  # noqa: BLE001
                sha = ""
            return GitResult(ok=True, message="nothing to commit", commit_sha=sha, remote=remote, branch=branch)

        if not remote:
            return GitResult(ok=False, message="remote url is empty", commit_sha=sha, remote=remote, branch=branch)

        try:
            repo.remotes.origin.push(refspec=f"{branch}:{branch}", set_upstream=True)
        except GitCommandError as push_exc:
            return GitResult(
                ok=False,
                message=f"commit ok but push failed: {_friendly_push_error(push_exc)}",
                commit_sha=sha,
                remote=remote,
                branch=branch,
            )
        return GitResult(ok=True, message="pushed", commit_sha=sha, remote=remote, branch=branch)
    except Exception as exc:  # noqa: BLE001
        return GitResult(ok=False, message=str(exc), remote=remote, branch=branch)
