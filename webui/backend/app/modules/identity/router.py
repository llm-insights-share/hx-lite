import re
import time
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlmodel import select

from app.core.config import get_settings
from app.core.deps import CurrentUser, SessionDep, require_roles
from app.core.models import ProjectMember, User
from app.core.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

OrgAdmin = Annotated[User, Depends(require_roles("org_admin"))]

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+$")
USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{2,64}$")


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    display_name: str
    avatar_url: str = ""
    roles: str
    is_active: bool = True


class RegisterIn(BaseModel):
    email: str
    username: str
    password: str = Field(min_length=6)
    display_name: str = ""


class AdminCreateUserIn(BaseModel):
    email: str
    username: str
    password: str = Field(min_length=6)
    display_name: str = ""
    roles: str = "member"


class ActiveIn(BaseModel):
    is_active: bool


class RolesIn(BaseModel):
    roles: str


class ProfileUpdateIn(BaseModel):
    display_name: str = ""
    email: str


class PasswordUpdateIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _normalize_username(username: str) -> str:
    return (username or "").strip()


def _validate_credentials(email: str, username: str, password: str) -> tuple[str, str]:
    email_n = _normalize_email(email)
    username_n = _normalize_username(username)
    if not EMAIL_RE.match(email_n):
        raise HTTPException(status_code=400, detail="Invalid email format")
    if not USERNAME_RE.match(username_n):
        raise HTTPException(
            status_code=400,
            detail="Username must be 2–64 chars: letters, digits, . _ -",
        )
    if len(password or "") < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    return email_n, username_n


def _ensure_unique(session: SessionDep, *, email: str, username: str, exclude_id: int | None = None) -> None:
    q_user = select(User).where(User.username == username)
    q_email = select(User).where(User.email == email)
    existing_u = session.exec(q_user).first()
    existing_e = session.exec(q_email).first()
    if existing_u and existing_u.id != exclude_id:
        raise HTTPException(status_code=400, detail="Username already taken")
    if existing_e and existing_e.id != exclude_id:
        raise HTTPException(status_code=400, detail="Email already registered")


def _role_set(roles: str) -> set[str]:
    return {r.strip() for r in (roles or "").split(",") if r.strip()}


def _count_active_org_admins(session: SessionDep, *, exclude_id: int | None = None) -> int:
    n = 0
    for u in session.exec(select(User).where(User.is_active == True)).all():  # noqa: E712
        if exclude_id is not None and u.id == exclude_id:
            continue
        if "org_admin" in _role_set(u.roles):
            n += 1
    return n


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id or 0,
        username=u.username,
        email=u.email or "",
        display_name=u.display_name,
        avatar_url=u.avatar_url or "",
        roles=u.roles,
        is_active=u.is_active,
    )


@router.post("/login", response_model=TokenOut)
def login(session: SessionDep, form_data: OAuth2PasswordRequestForm = Depends()):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User is blocked")
    token = create_access_token(user.username, {"roles": user.roles})
    return TokenOut(access_token=token)


@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, session: SessionDep):
    email, username = _validate_credentials(body.email, body.username, body.password)
    _ensure_unique(session, email=email, username=username)
    user = User(
        username=username,
        email=email,
        display_name=(body.display_name or "").strip() or username,
        hashed_password=hash_password(body.password),
        roles="member",
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(user.username, {"roles": user.roles})
    return TokenOut(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return _user_out(user)


@router.patch("/me/profile", response_model=UserOut)
def update_me_profile(body: ProfileUpdateIn, session: SessionDep, user: CurrentUser):
    email_n = _normalize_email(body.email)
    if not EMAIL_RE.match(email_n):
        raise HTTPException(status_code=400, detail="Invalid email format")
    _ensure_unique(session, email=email_n, username=user.username, exclude_id=user.id)
    user.email = email_n
    user.display_name = (body.display_name or "").strip() or user.username
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user)


@router.patch("/me/password")
def update_me_password(body: PasswordUpdateIn, session: SessionDep, user: CurrentUser):
    if not verify_password(body.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="旧密码错误")
    if len(body.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    user.hashed_password = hash_password(body.new_password)
    session.add(user)
    session.commit()
    return {"ok": True}


@router.post("/me/avatar", response_model=UserOut)
async def upload_me_avatar(session: SessionDep, user: CurrentUser, file: UploadFile = File(...)):
    ctype = (file.content_type or "").lower()
    if ctype not in {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}:
        raise HTTPException(status_code=400, detail="仅支持 png/jpg/webp/gif 图片")
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="头像大小不能超过 2MB")
    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    ext = ext_map.get(ctype, ".png")
    settings = get_settings()
    adir = settings.data_dir / "avatars"
    adir.mkdir(parents=True, exist_ok=True)
    # Remove stale avatar files for same user
    for p in adir.glob(f"{user.id}.*"):
        try:
            p.unlink()
        except Exception:
            pass
    target = adir / f"{user.id}{ext}"
    Path(target).write_bytes(data)
    # Cache-bust so browsers/Avatar reload when file content changes at same path
    user.avatar_url = f"/avatars/{target.name}?v={int(time.time() * 1000)}"
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user)


# ---- Org admin user management (mounted under /api/org via separate router) ----

org_users_router = APIRouter(prefix="/api/org", tags=["org-users"])


@org_users_router.get("/users", response_model=list[UserOut])
def list_org_users(session: SessionDep, _admin: OrgAdmin):
    rows = session.exec(select(User).order_by(User.id)).all()
    return [_user_out(u) for u in rows]


@org_users_router.post("/users", response_model=UserOut)
def create_org_user(body: AdminCreateUserIn, session: SessionDep, _admin: OrgAdmin):
    email, username = _validate_credentials(body.email, body.username, body.password)
    _ensure_unique(session, email=email, username=username)
    roles = ",".join(sorted(_role_set(body.roles))) or "member"
    user = User(
        username=username,
        email=email,
        display_name=(body.display_name or "").strip() or username,
        hashed_password=hash_password(body.password),
        roles=roles,
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user)


@org_users_router.patch("/users/{user_id}/active", response_model=UserOut)
def set_user_active(user_id: int, body: ActiveIn, session: SessionDep, admin: OrgAdmin):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    if not body.is_active and "org_admin" in _role_set(user.roles):
        if _count_active_org_admins(session, exclude_id=user.id) < 1:
            raise HTTPException(status_code=400, detail="Cannot block the last org_admin")
    user.is_active = body.is_active
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user)


@org_users_router.patch("/users/{user_id}/roles", response_model=UserOut)
def set_user_roles(user_id: int, body: RolesIn, session: SessionDep, admin: OrgAdmin):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    roles = ",".join(sorted(_role_set(body.roles))) or "member"
    next_roles = _role_set(roles)
    if "org_admin" not in next_roles and "org_admin" in _role_set(user.roles):
        if _count_active_org_admins(session, exclude_id=user.id) < 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last org_admin")
    user.roles = roles
    session.add(user)
    session.commit()
    session.refresh(user)
    return _user_out(user)


@org_users_router.delete("/users/{user_id}")
def delete_org_user(user_id: int, session: SessionDep, admin: OrgAdmin):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if "org_admin" in _role_set(user.roles) and user.is_active:
        if _count_active_org_admins(session, exclude_id=user.id) < 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last org_admin")
    for m in session.exec(select(ProjectMember).where(ProjectMember.user_id == user_id)).all():
        session.delete(m)
    session.delete(user)
    session.commit()
    return {"ok": True}
