from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HX_WEBUI_", env_file=".env", extra="ignore")

    app_name: str = "HX WebUI"
    secret_key: str = "hx-webui-dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 12
    database_url: str = f"sqlite:///{DATA_DIR / 'hx_webui.db'}"
    data_dir: Path = DATA_DIR
    hubs_dir: Path = DATA_DIR / "hubs"
    artifacts_dir: Path = DATA_DIR / "artifacts"
    repos_dir: Path = DATA_DIR / "repos"
    github_token: str = ""
    admin_username: str = "admin"
    admin_password: str = "admin123"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.hubs_dir.mkdir(parents=True, exist_ok=True)
    s.artifacts_dir.mkdir(parents=True, exist_ok=True)
    s.repos_dir.mkdir(parents=True, exist_ok=True)
    return s
