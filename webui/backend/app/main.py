from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.db import engine, init_db
from app.core.models import User
from app.core.security import hash_password
from app.modules.identity.router import org_users_router, router as identity_router
from app.modules.org_assets.router import router as org_router
from app.modules.project.router import router as project_router


def seed_admin() -> None:
    settings = get_settings()
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.username == settings.admin_username)).first()
        if existing:
            return
        user = User(
            username=settings.admin_username,
            email=f"{settings.admin_username}@localhost",
            display_name="Administrator",
            hashed_password=hash_password(settings.admin_password),
            roles="org_admin,project_owner,approver,member",
        )
        session.add(user)
        # demo member
        session.add(
            User(
                username="member",
                email="member@localhost",
                display_name="Demo Member",
                hashed_password=hash_password("member123"),
                roles="member",
            )
        )
        session.add(
            User(
                username="approver",
                email="approver@localhost",
                display_name="Demo Approver",
                hashed_password=hash_password("approver123"),
                roles="approver,member",
            )
        )
        session.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    seed_admin()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(identity_router)
    app.include_router(org_users_router)
    app.include_router(org_router)
    app.include_router(project_router)
    avatar_dir = settings.data_dir / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/avatars", StaticFiles(directory=str(avatar_dir)), name="avatars")

    @app.get("/api/health")
    def health():
        return {"ok": True, "app": settings.app_name}

    return app


app = create_app()
