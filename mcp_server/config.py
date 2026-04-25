from pathlib import Path

DB_DIR_NAME = ".mcp_mental_model"
DB_FILE_NAME = "db.sqlite"
UI_HOST = "127.0.0.1"
UI_PORT = 7432


def get_db_path(project_path: str) -> Path:
    db_dir = Path(project_path) / DB_DIR_NAME
    db_dir.mkdir(exist_ok=True)
    return db_dir / DB_FILE_NAME
