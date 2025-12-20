import os
import requests
import argparse


# Configuration
RAG_SERVER_URL = "http://localhost:8001"
TARGET_EXTENSIONS = [".ts", ".tsx", ".js", ".md", ".py", ".json"]
IGNORE_DIRS = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    "chroma_db",
    "__pycache__",
    "venv",
]


def is_ignored(path):
    for ignore in IGNORE_DIRS:
        if ignore in path.split(os.sep):
            return True
    return False


def ingest_file(file_path, root_dir):
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Create a relative path ID
        rel_path = os.path.relpath(file_path, root_dir)

        payload = {
            "id": rel_path,
            "text": content,
            "metadata": {"source": rel_path, "type": os.path.splitext(file_path)[1]},
        }

        response = requests.post(f"{RAG_SERVER_URL}/ingest", json=payload)
        if response.status_code == 200:
            print(f"[OK] Ingested: {rel_path}")
        else:
            print(f"[ERR] Failed {rel_path}: {response.text}")

    except Exception as e:
        print(f"[SKIP] Error reading {file_path}: {e}")


def main():
    parser = argparse.ArgumentParser(description="Ingest codebase into RAG engine")
    parser.add_argument("root_dir", help="Root directory of the codebase to ingest")
    args = parser.parse_args()

    abs_root = os.path.abspath(args.root_dir)
    print(f"Starting ingestion for: {abs_root}")

    for root, dirs, files in os.walk(abs_root):
        # Filter ignore dirs in-place
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file in files:
            ext = os.path.splitext(file)[1]
            if ext in TARGET_EXTENSIONS:
                full_path = os.path.join(root, file)
                if not is_ignored(full_path):
                    ingest_file(full_path, abs_root)


if __name__ == "__main__":
    main()
