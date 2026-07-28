import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlmodel import select

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
