#!/usr/bin/env python3
"""Harness-neutral reader/writer admission for one initialized Project Root."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import secrets
import sqlite3
import stat
import subprocess
import sys
import time
import unicodedata
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath


PROTOCOL_VERSION = 3
CONFIG_SCHEMA_VERSION = 1
SESSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CONTROL_DIRECTORY = ".project-conventions"
CONFIG_FILE = "project.json"
DATABASE_FILE = "access.sqlite3"
GIT_OPERATION_MARKERS = (
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "BISECT_LOG",
    "rebase-apply",
    "rebase-merge",
    "index.lock",
    "shallow.lock",
)
MANAGED_START = "<!-- project-conventions:access:start -->"
MANAGED_END = "<!-- project-conventions:access:end -->"
RESERVED_SHARED_PATHS = (
    ".project-conventions",
    ".git",
    "conversation",
    "controller",
    "docs/indexes",
    "INDEX.md",
    "MEMBERS.md",
    "memory",
)
HARNESS_ENTRIES = {
    ".agents",
    ".claude",
    ".codex",
    ".minimax",
    ".qoder",
    ".qoderworkcn",
    ".trae",
    ".workbuddy",
}
RESERVED_OPTIONAL_PATH_PARTS = {".git", CONTROL_DIRECTORY, *HARNESS_ENTRIES}
WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{number}" for number in range(1, 10)),
    *(f"LPT{number}" for number in range(1, 10)),
}
CONFIG_KEYS = {
    "access_readme_sha256",
    "agents_block_sha256",
    "coordination_id",
    "coordination_root",
    "helper_sha256",
    "project_profile",
    "project_role",
    "project_type",
    "records_dir",
    "repository_root",
    "runtime_backend",
    "schema_version",
    "skill_package",
}


class AccessError(RuntimeError):
    """Raised when the admission protocol cannot be applied safely."""


class AccessConflict(AccessError):
    """Raised when an active claim blocks the requested mode."""


def portable_text_sha256(content: bytes) -> str:
    """Hash text after canonicalizing checkout-dependent line endings."""
    normalized = content.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(normalized).hexdigest()


def safe_config_relative(value: object, label: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value or value != value.strip() or "\\" in value:
        raise AccessError(f"{label} must be a portable relative path")
    value = unicodedata.normalize("NFC", value)
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or not path.parts
        or path.as_posix() != value
        or path.as_posix() == "."
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise AccessError(f"{label} must be a normalized relative path")
    for part in path.parts:
        stem = part.split(".", 1)[0].upper()
        if (
            any(ord(character) < 32 or character in '<>:"|?*' for character in part)
            or part.endswith((".", " "))
            or stem in WINDOWS_RESERVED_NAMES
        ):
            raise AccessError(f"{label} is not portable across supported filesystems")
        if part.casefold() in {entry.casefold() for entry in RESERVED_OPTIONAL_PATH_PARTS}:
            raise AccessError(f"{label} enters a reserved project boundary")
    return path.as_posix()


def safe_coordination_root(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or "\\" in value:
        raise AccessError("coordination_root must be one portable sibling path")
    path = PurePosixPath(value)
    sibling = path.parts[1] if len(path.parts) == 2 else ""
    stem = sibling.split(".", 1)[0].upper()
    if (
        len(path.parts) != 2
        or path.parts[0] != ".."
        or not SESSION_PATTERN.fullmatch(sibling)
        or sibling.endswith((".", " "))
        or stem in WINDOWS_RESERVED_NAMES
    ):
        raise AccessError("coordination_root must be exactly ../<sibling-project>")
    return path.as_posix()


def safe_coordination_id(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not SESSION_PATTERN.fullmatch(value):
        raise AccessError("coordination_id must be one portable project name")
    stem = value.split(".", 1)[0].upper()
    if value.endswith((".", " ")) or stem in WINDOWS_RESERVED_NAMES:
        raise AccessError("coordination_id must be one portable project name")
    return value


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def is_link_or_junction(path: Path) -> bool:
    native = getattr(os.path, "isjunction", None)
    junction = False
    if native is not None:
        try:
            junction = bool(native(path))
        except OSError:
            junction = False
    elif os.name == "nt":
        try:
            observed = os.lstat(path)
            junction = getattr(observed, "st_reparse_tag", None) == getattr(
                stat, "IO_REPARSE_TAG_MOUNT_POINT", 0xA0000003
            )
        except OSError:
            junction = False
    return path.is_symlink() or junction


def resolve_control(script_path: Path) -> tuple[Path, Path, dict[str, object]]:
    if is_link_or_junction(script_path) or not script_path.is_file():
        raise AccessError(f"invalid project access helper: {script_path}")
    control = script_path.expanduser().absolute().parent
    if control.name != CONTROL_DIRECTORY or is_link_or_junction(control):
        raise AccessError(f"invalid project control directory: {control}")
    project_root = control.parent
    if is_link_or_junction(project_root) or not project_root.is_dir():
        raise AccessError(f"invalid Project Root: {project_root}")
    config_path = control / CONFIG_FILE
    if is_link_or_junction(config_path) or not config_path.is_file():
        raise AccessError(f"missing real project configuration: {config_path}")
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise AccessError(f"invalid project configuration: {exc}") from exc
    if config.get("schema_version") != CONFIG_SCHEMA_VERSION:
        raise AccessError("unsupported project coordination schema")
    if set(config) - {"coordination_policy"} != CONFIG_KEYS:
        raise AccessError("project configuration field set is invalid")
    if config.get("coordination_policy", "legacy-claims") not in {"worktree-first", "legacy-claims"}:
        raise AccessError("unsupported coordination policy")
    if config.get("project_type") not in {"code", "document", "hybrid"}:
        raise AccessError("invalid project_type in project configuration")
    if config.get("project_profile") not in {"standard", "agent-skill"}:
        raise AccessError("invalid project_profile in project configuration")
    if config.get("project_role") not in {
        "ordinary",
        "collection-control",
        "collection-member",
    }:
        raise AccessError("invalid project_role in project configuration")
    if config.get("project_role") != "ordinary" and config.get("project_profile") != "standard":
        raise AccessError("shared collection roles require the standard project profile")
    skill_package = config.get("skill_package")
    if config.get("project_profile") == "agent-skill":
        if (
            config.get("project_type") != "code"
            or not isinstance(skill_package, str)
            or len(skill_package) > 64
            or not SKILL_NAME_PATTERN.fullmatch(skill_package)
        ):
            raise AccessError("invalid agent-skill package configuration")
    elif skill_package is not None:
        raise AccessError("standard project configuration cannot name a Skill package")
    config["repository_root"] = safe_config_relative(
        config.get("repository_root"), "repository_root"
    )
    config["records_dir"] = safe_config_relative(config.get("records_dir"), "records_dir")
    config["coordination_id"] = safe_coordination_id(config.get("coordination_id"))
    config["coordination_root"] = safe_coordination_root(config.get("coordination_root"))
    if config.get("runtime_backend") not in {
        "project-local",
        "git-common-dir",
        "collection-control",
    }:
        raise AccessError("invalid runtime_backend in project configuration")
    role = config.get("project_role")
    coordination_id = config.get("coordination_id")
    coordination_root = config.get("coordination_root")
    backend = config.get("runtime_backend")
    if role == "collection-control":
        if (
            backend != "project-local"
            or coordination_root is not None
            or coordination_id is None
            or project_root.name != coordination_id
        ):
            raise AccessError("collection-control identity or runtime configuration is invalid")
    elif role == "collection-member":
        if (
            backend != "collection-control"
            or coordination_id is None
            or coordination_root != f"../{coordination_id}"
        ):
            raise AccessError("shared-member coordination binding is invalid")
    elif coordination_id is not None or coordination_root is not None or backend == "collection-control":
        raise AccessError("coordination binding is valid only for shared collection profiles")
    helper_digest = config.get("helper_sha256")
    if not isinstance(helper_digest, str) or not secrets.compare_digest(
        helper_digest, portable_text_sha256(script_path.read_bytes())
    ):
        raise AccessError("project access helper digest differs from project configuration")
    agents_path = project_root / "AGENTS.md"
    access_path = control / "ACCESS.md"
    if is_link_or_junction(agents_path) or not agents_path.is_file():
        raise AccessError("project AGENTS.md is missing or linked")
    if is_link_or_junction(access_path) or not access_path.is_file():
        raise AccessError("project ACCESS.md is missing or linked")
    agents_text = agents_path.read_text(encoding="utf-8")
    if agents_text.count(MANAGED_START) != 1 or agents_text.count(MANAGED_END) != 1:
        raise AccessError("project AGENTS.md managed access block is missing or duplicated")
    start = agents_text.index(MANAGED_START)
    end = agents_text.index(MANAGED_END, start) + len(MANAGED_END)
    managed_block = agents_text[start:end]
    if config.get("agents_block_sha256") != hashlib.sha256(
        managed_block.encode("utf-8")
    ).hexdigest():
        raise AccessError("project AGENTS.md managed access block digest differs")
    if config.get("access_readme_sha256") != portable_text_sha256(access_path.read_bytes()):
        raise AccessError("project ACCESS.md digest differs from project configuration")
    return project_root.resolve(), control.resolve(), config


def run_git(project_root: Path, *arguments: str) -> str | None:
    completed = subprocess.run(
        ["git", "-C", str(project_root), *arguments],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    return completed.stdout.strip()


def path_identity(value: str | Path) -> str:
    return unicodedata.normalize("NFC", os.path.normpath(str(value))).casefold()


def runtime_root(
    project_root: Path, control: Path, config: dict[str, object]
) -> tuple[Path, str]:
    backend = config.get("runtime_backend")
    if backend == "project-local":
        return control / "runtime", "project-local"
    if backend == "collection-control":
        coordination_relative = str(config.get("coordination_root"))
        coordination_id = str(config.get("coordination_id"))
        coordination = project_root / coordination_relative
        if is_link_or_junction(coordination) or not coordination.is_dir():
            raise AccessError("collection coordination Project Root is missing or linked")
        coordination = coordination.resolve()
        if path_identity(coordination.parent) != path_identity(project_root.parent):
            raise AccessError("collection coordination Project Root is not an exact sibling")
        coordination_control = coordination / CONTROL_DIRECTORY
        if is_link_or_junction(coordination_control) or not coordination_control.is_dir():
            raise AccessError("collection coordination control directory is missing or linked")
        coordinator_root, verified_control, coordinator = resolve_control(
            coordination_control / "project_access.py"
        )
        if (
            path_identity(coordinator_root) != path_identity(coordination)
            or path_identity(verified_control) != path_identity(coordination_control)
            or coordinator.get("project_role") != "collection-control"
            or coordinator.get("runtime_backend") != "project-local"
            or coordinator.get("coordination_id") != coordination_id
            or coordinator.get("coordination_root") is not None
        ):
            raise AccessError("collection coordinator authority or identity differs")
        return verified_control / "runtime", "collection-control"
    if backend != "git-common-dir":
        raise AccessError("project configuration has an invalid runtime_backend")
    repository_relative = config.get("repository_root")
    repository_root = (
        project_root / str(repository_relative) if repository_relative is not None else project_root
    )
    current = project_root
    for part in repository_root.relative_to(project_root).parts:
        current = current / part
        if is_link_or_junction(current):
            raise AccessError("configured Repository Root contains a directory link")
    top = run_git(repository_root, "rev-parse", "--show-toplevel")
    common = run_git(repository_root, "rev-parse", "--git-common-dir") if top else None
    if top and common:
        top_path = Path(top).expanduser().resolve()
        if path_identity(top_path) == path_identity(repository_root.resolve()):
            common_path = Path(common)
            if not common_path.is_absolute():
                common_path = repository_root / common_path
            return common_path.resolve() / "project-conventions-access", "git-common-dir"
    raise AccessError("git-common-dir runtime requires this Project Root to be a Git worktree root")


def git_evidence(project_root: Path) -> dict[str, object]:
    top = run_git(project_root, "rev-parse", "--show-toplevel")
    if not top or path_identity(Path(top).resolve()) != path_identity(project_root):
        return {"git_backed": False}
    head = run_git(project_root, "rev-parse", "HEAD")
    branch = run_git(project_root, "symbolic-ref", "--short", "-q", "HEAD")
    git_dir_raw = run_git(project_root, "rev-parse", "--git-dir")
    common_dir_raw = run_git(project_root, "rev-parse", "--git-common-dir")
    if git_dir_raw is None or common_dir_raw is None:
        return {"git_backed": False}
    git_dir = Path(git_dir_raw)
    common_dir = Path(common_dir_raw)
    if not git_dir.is_absolute():
        git_dir = project_root / git_dir
    if not common_dir.is_absolute():
        common_dir = project_root / common_dir
    git_dir = git_dir.resolve()
    common_dir = common_dir.resolve()
    operation_markers = sorted(
        {
            marker
            for base in {git_dir, common_dir}
            for marker in GIT_OPERATION_MARKERS
            if (base / marker).exists() or is_link_or_junction(base / marker)
        }
    )
    status = run_git(project_root, "status", "--porcelain=v1", "--untracked-files=normal")
    status_text = status if status is not None else "<git-status-unavailable>"
    return {
        "git_backed": True,
        "head": head or "unborn",
        "branch": branch or "detached",
        "git_dir": str(git_dir),
        "git_common_dir": str(common_dir),
        "linked_worktree": path_identity(git_dir) != path_identity(common_dir),
        "operation_markers": operation_markers,
        "status_sha256": hashlib.sha256(status_text.encode("utf-8")).hexdigest(),
        "clean": status_text == "",
    }


def connect(database: Path) -> sqlite3.Connection:
    # Some SQLite PRAGMAs can report BUSY before busy_timeout takes effect on
    # Windows. Retry only opening/transactional schema setup, never task writes.
    deadline = time.monotonic() + 5.0
    while True:
        try:
            return _connect_once(database)
        except sqlite3.OperationalError as error:
            code = getattr(error, "sqlite_errorcode", 0) & 0xff
            if code not in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED) or time.monotonic() >= deadline:
                raise
            time.sleep(0.025)


def transaction_boundary(connection: sqlite3.Connection, statement: str) -> None:
    """Retry lock acquisition/commit only; never replay claim reads or writes."""
    if statement not in {"BEGIN IMMEDIATE", "COMMIT"}:
        raise ValueError("only transaction boundaries may be retried")
    deadline = time.monotonic() + 5.0
    connection.execute("PRAGMA busy_timeout = 250")
    try:
        while True:
            try:
                connection.execute(statement)
                return
            except sqlite3.OperationalError as error:
                code = getattr(error, "sqlite_errorcode", 0) & 0xff
                remaining = deadline - time.monotonic()
                if code not in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED) or remaining <= 0:
                    raise
                # COMMIT returning BUSY leaves the transaction active. Retrying
                # that same COMMIT preserves the original atomic claim decision.
                time.sleep(min(0.025, remaining))
    finally:
        connection.execute("PRAGMA busy_timeout = 5000")


def _connect_once(database: Path) -> sqlite3.Connection:
    ensure_runtime_boundary(database, create=True)
    if not database.exists():
        try:
            descriptor = os.open(database, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            ensure_runtime_boundary(database, create=False)
        else:
            os.close(descriptor)
    ensure_runtime_boundary(database, create=False)
    connection = sqlite3.connect(database, timeout=0.25, isolation_level=None)
    try:
        connection.execute("PRAGMA busy_timeout = 250")
        journal_mode = connection.execute("PRAGMA journal_mode").fetchone()
        if journal_mode is None or str(journal_mode[0]).lower() != "delete":
            raise AccessError("runtime database must use DELETE journal mode")
        connection.execute("PRAGMA synchronous = FULL")

        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        if {"meta", "claims", "history", "recovery_plans"} <= tables and connection.execute(
            "SELECT value FROM meta WHERE key = 'protocol_version'"
        ).fetchone() == (str(PROTOCOL_VERSION),):
            # The version marker and all tables committed together. Ordinary
            # connections need no competing schema write transaction after that.
            connection.execute("PRAGMA busy_timeout = 5000")
            return connection

        # One transaction serializes first-use schema creation.  Reissuing
        # PRAGMA journal_mode=DELETE in every process takes a competing write
        # lock on Windows and can fail before SQLite's busy timeout applies.
        connection.execute("BEGIN IMMEDIATE")
        for statement in (
            """
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS claims (
                session_id TEXT PRIMARY KEY,
                mode TEXT NOT NULL CHECK (mode IN ('read-only', 'writer', 'isolated-writer', 'scoped-writer')),
                token_hash TEXT NOT NULL,
                actor TEXT NOT NULL,
                workspace TEXT NOT NULL,
                acquired_at TEXT NOT NULL,
                write_paths_json TEXT NOT NULL,
                evidence_json TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS history (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                actor TEXT NOT NULL,
                event TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                reason TEXT NOT NULL,
                evidence_json TEXT NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS recovery_plans (
                session_id TEXT PRIMARY KEY,
                token_hash TEXT NOT NULL,
                claim_token_hash TEXT NOT NULL,
                reason TEXT NOT NULL,
                planned_at TEXT NOT NULL
            )
            """,
        ):
            connection.execute(statement)
        connection.execute(
            "INSERT OR IGNORE INTO meta(key, value) VALUES('protocol_version', ?)",
            (str(PROTOCOL_VERSION),),
        )
        observed = connection.execute(
            "SELECT value FROM meta WHERE key = 'protocol_version'"
        ).fetchone()
        if observed is not None and observed[0] == "1":
            # Preserve active sessions, token hashes, recovery plans and history.
            # Old helpers reject the new version instead of applying old rules.
            connection.execute("ALTER TABLE claims RENAME TO claims_v1")
            connection.execute("""
                CREATE TABLE claims (
                    session_id TEXT PRIMARY KEY,
                    mode TEXT NOT NULL CHECK (mode IN ('read-only', 'writer', 'isolated-writer', 'scoped-writer')),
                    token_hash TEXT NOT NULL, actor TEXT NOT NULL,
                    workspace TEXT NOT NULL, acquired_at TEXT NOT NULL,
                    write_paths_json TEXT NOT NULL, evidence_json TEXT NOT NULL
                )
            """)
            connection.execute("INSERT INTO claims SELECT * FROM claims_v1")
            connection.execute("DROP TABLE claims_v1")
            connection.execute("UPDATE meta SET value = ? WHERE key = 'protocol_version'", (str(PROTOCOL_VERSION),))
        elif observed is not None and observed[0] == "2":
            connection.execute("UPDATE meta SET value = ? WHERE key = 'protocol_version'", (str(PROTOCOL_VERSION),))
        elif observed is None or observed[0] != str(PROTOCOL_VERSION):
            raise AccessError("runtime database uses an unsupported protocol version")
        connection.execute("COMMIT")
        # Restore the ordinary transaction timeout after initialization.
        connection.execute("PRAGMA busy_timeout = 5000")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        connection.close()
        raise
    return connection


def ensure_runtime_boundary(database: Path, create: bool) -> None:
    runtime = database.parent
    if is_link_or_junction(runtime):
        raise AccessError("runtime directory must not be a symlink or junction")
    if runtime.exists():
        if not runtime.is_dir():
            raise AccessError("runtime path must be a real directory")
    elif create:
        parent = runtime.parent
        if is_link_or_junction(parent) or not parent.is_dir():
            raise AccessError("runtime parent must be a real directory")
        try:
            runtime.mkdir()
        except FileExistsError:
            if is_link_or_junction(runtime) or not runtime.is_dir():
                raise AccessError("runtime directory collision is linked or not a directory")
    if is_link_or_junction(database):
        raise AccessError("runtime database must not be a symlink or junction")
    if database.exists() and not database.is_file():
        raise AccessError("runtime database path is not a real file")


def public_claims(connection: sqlite3.Connection) -> list[dict[str, object]]:
    rows = connection.execute(
        "SELECT session_id, mode, actor, workspace, acquired_at, write_paths_json, evidence_json "
        "FROM claims ORDER BY acquired_at, session_id"
    ).fetchall()
    return [
        {
            "session_id": row[0],
            "mode": row[1],
            "actor": row[2],
            "workspace": row[3],
            "acquired_at": row[4],
            **claim_paths(row[1], row[5]),
            "evidence": json.loads(row[6]),
        }
        for row in rows
    ]


def claim_paths(mode: str, encoded: str) -> dict[str, object]:
    values = json.loads(encoded)
    if mode == "scoped-writer":
        return {"write_paths": [scope["path"] for scope in values], "write_scopes": values}
    return {"write_paths": values, "write_scopes": []}


def validate_session(value: str | None) -> str:
    if value is None:
        return secrets.token_hex(12)
    if not SESSION_PATTERN.fullmatch(value):
        raise AccessError("session must use 1-128 letters, digits, dot, underscore, or hyphen")
    return value


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_write_paths(values: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in values:
        if not value or value != value.strip() or "\\" in value:
            raise AccessError("write paths must be normalized workspace-relative paths")
        value = unicodedata.normalize("NFC", value)
        path = PurePosixPath(value)
        candidate = path.as_posix()
        if (
            path.is_absolute()
            or not path.parts
            or candidate == "."
            or candidate != value
            or any(part in {"", ".", ".."} for part in path.parts)
        ):
            raise AccessError("write paths must be normalized workspace-relative paths")
        for part in path.parts:
            stem = part.split(".", 1)[0].upper()
            if (
                any(ord(character) < 32 or character in '<>:"|?*' for character in part)
                or part.endswith((".", " "))
                or stem in WINDOWS_RESERVED_NAMES
            ):
                raise AccessError("write paths must be portable across supported filesystems")
        if candidate not in normalized:
            normalized.append(candidate)
    return sorted(normalized)


def path_overlap(left: str, right: str) -> bool:
    # Declared paths are a portable logical scope. Compare conservatively so a
    # plan created on a case-sensitive host cannot bypass canonical paths when
    # the same repository is used on common case-insensitive hosts.
    left = unicodedata.normalize("NFC", left).casefold()
    right = unicodedata.normalize("NFC", right).casefold()
    return left == right or left.startswith(right + "/") or right.startswith(left + "/")


def reaches_reserved(path: str) -> bool:
    return any(path_overlap(path, reserved) for reserved in RESERVED_SHARED_PATHS) or any(
        part.casefold() in {entry.casefold() for entry in RESERVED_OPTIONAL_PATH_PARTS}
        for part in PurePosixPath(path).parts
    )


def reject_linked_write_paths(workspace: Path, write_paths: list[str]) -> None:
    for relative in write_paths:
        current = workspace
        parts = PurePosixPath(relative).parts
        for index, part in enumerate(parts):
            current = current / part
            if is_link_or_junction(current):
                raise AccessError(f"write path contains a directory/file link: {relative}")
            if current.exists() and not current.is_dir() and index < len(parts) - 1:
                raise AccessError(f"write path contains a non-directory component: {relative}")
            if not current.exists():
                break


def validate_write_scopes(workspace: Path, scopes: list[dict[str, str]]) -> None:
    """Validate explicit file/subtree declarations; never infer a parent claim."""
    reject_linked_write_paths(workspace, [scope["path"] for scope in scopes])
    reserved = {entry.casefold() for entry in RESERVED_OPTIONAL_PATH_PARTS}
    for scope in scopes:
        relative = scope["path"]
        if any(part.casefold() in reserved for part in PurePosixPath(relative).parts):
            raise AccessError("scoped writers cannot claim Git, protocol or Harness metadata")
        target = workspace / relative
        if target.exists():
            if scope["kind"] == "file" and not target.is_file():
                raise AccessError(f"--write-file target is not a regular file: {relative}")
            if scope["kind"] == "directory" and not target.is_dir():
                raise AccessError(f"--write-dir target is not a directory: {relative}")
            if target.is_file() and target.stat().st_nlink > 1:
                raise AccessError(f"write target has hard-link aliases: {relative}")


def physical_claim_paths(claim: dict[str, object]) -> list[str]:
    workspace = Path(str(claim["workspace"]))
    if claim["mode"] in {"isolated-writer", "writer"}:
        # One writer per physical worktree: its index/build outputs are shared.
        return [workspace.as_posix()]
    return [(workspace / path).as_posix() for path in claim["write_paths"]]


def claims_conflict(requested: dict[str, object], existing: dict[str, object]) -> bool:
    if "read-only" in {requested["mode"], existing["mode"]}:
        return False
    if any(claim.get("evidence", {}).get("registry_maintenance") for claim in (requested, existing)):
        return True
    return any(
        path_overlap(left, right)
        for left in physical_claim_paths(requested)
        for right in physical_claim_paths(existing)
    )


def status(project_root: Path, database: Path, storage: str) -> dict[str, object]:
    if not database.exists():
        claims: list[dict[str, object]] = []
    else:
        with closing(connect(database)) as connection:
            claims = public_claims(connection)
    return {
        "status": "ready",
        "protocol_version": PROTOCOL_VERSION,
        "project_root": str(project_root),
        "runtime_storage": storage,
        "claims": claims,
        "read_only_allowed": True,
        "writer_allowed": not any(claims_conflict(
            {"mode": "writer", "workspace": str(project_root), "write_paths": []}, claim
        ) for claim in claims),
        "writer_scope": "physical_workspace_subtree",
        "isolated_writer_allowed": "requires_nonoverlapping_linked_worktree",
        "scoped_writer_allowed": "requires_nonconflicting_paths",
        "next_action": "select the actual task mode and enter; active claims alone do not deny reading",
    }


def enter(
    project_root: Path,
    database: Path,
    storage: str,
    mode: str,
    session_id: str | None,
    actor: str,
    write_paths: list[str],
    workspace: Path | None,
    write_files: list[str] | None = None,
    write_dirs: list[str] | None = None,
    registry_maintenance: bool = False,
) -> dict[str, object]:
    session_id = validate_session(session_id)
    actor = actor.strip()
    if registry_maintenance and mode != "writer":
        raise AccessError("registry maintenance requires writer mode")
    if not actor or len(actor) > 160:
        raise AccessError("actor must be a non-empty label of at most 160 characters")
    write_paths = normalize_write_paths(write_paths)
    scopes = [
        {"kind": kind, "path": path}
        for kind, values in (("file", write_files or []), ("directory", write_dirs or []))
        for path in normalize_write_paths(values)
    ]
    if mode == "scoped-writer":
        if not scopes or write_paths:
            raise AccessError("scoped-writer requires --write-file and/or --write-dir; not --write-path")
        for index, scope in enumerate(scopes):
            if any(path_overlap(scope["path"], other["path"]) for other in scopes[:index]):
                raise AccessError("write scopes must not duplicate or contain one another")
        validate_write_scopes(project_root, scopes)
    elif scopes:
        raise AccessError("--write-file and --write-dir are valid only with scoped-writer")
    if mode == "isolated-writer":
        if not write_paths:
            raise AccessError("isolated-writer requires at least one --write-path")
        reserved = [path for path in write_paths if reaches_reserved(path)]
        if reserved:
            raise AccessError(
                "isolated writers cannot claim canonical shared records: " + ", ".join(reserved)
            )
    elif write_paths:
        raise AccessError("--write-path is valid only with isolated-writer")
    if mode == "isolated-writer":
        actual_workspace = (workspace or project_root).expanduser().absolute()
        if is_link_or_junction(actual_workspace) or not actual_workspace.is_dir():
            raise AccessError("isolated-writer workspace must be a real directory")
        actual_workspace = actual_workspace.resolve()
        reject_linked_write_paths(actual_workspace, write_paths)
    else:
        if workspace is not None:
            raise AccessError("--workspace is valid only with isolated-writer")
        actual_workspace = project_root
    if mode == "scoped-writer":
        write_paths = [scope["path"] for scope in scopes]
    token = secrets.token_hex(24)
    evidence = git_evidence(actual_workspace)
    if registry_maintenance:
        evidence["registry_maintenance"] = True
    if mode == "writer" and evidence.get("linked_worktree"):
        raise AccessError(
            "exclusive writer must enter from the canonical worktree or Project Root wrapper"
        )
    if mode == "isolated-writer":
        if not evidence.get("git_backed") or not evidence.get("linked_worktree"):
            raise AccessError("isolated-writer requires a real linked Git worktree")
        if not evidence.get("clean"):
            raise AccessError("isolated-writer worktree must be clean before admission")
        if evidence.get("branch") == "detached":
            raise AccessError("isolated-writer requires an attached branch")
        if evidence.get("operation_markers"):
            raise AccessError("isolated-writer worktree has an active Git operation")
        if storage != "git-common-dir":
            raise AccessError("isolated-writer requires a Git-common coordination backend")
        expected_common = database.parent.parent.resolve()
        observed_common = Path(str(evidence["git_common_dir"])).resolve()
        if path_identity(expected_common) != path_identity(observed_common):
            raise AccessError("isolated-writer belongs to a different source repository")
    acquired_at = utc_now()
    connection = connect(database)
    try:
        transaction_boundary(connection, "BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT mode, actor FROM claims WHERE session_id = ?", (session_id,)
        ).fetchone()
        if existing is not None:
            connection.execute("ROLLBACK")
            raise AccessError(
                f"session already has an active {existing[0]} claim for actor {existing[1]!r}"
            )
        claims = public_claims(connection)
        requested = {"mode": mode, "workspace": str(actual_workspace), "write_paths": write_paths, "evidence": evidence}
        conflicts = [claim for claim in claims if claims_conflict(requested, claim)]
        if conflicts:
            connection.execute("ROLLBACK")
            raise AccessConflict(json.dumps(conflicts, ensure_ascii=False, sort_keys=True))
        connection.execute(
            "INSERT INTO claims(session_id, mode, token_hash, actor, workspace, acquired_at, write_paths_json, evidence_json) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
            (
                session_id,
                mode,
                token_digest(token),
                actor,
                str(actual_workspace),
                acquired_at,
                json.dumps(scopes if mode == "scoped-writer" else write_paths, ensure_ascii=False, sort_keys=True),
                json.dumps(evidence, ensure_ascii=False, sort_keys=True),
            ),
        )
        transaction_boundary(connection, "COMMIT")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()
    return {
        "status": "entered",
        "protocol_version": PROTOCOL_VERSION,
        "project_root": str(project_root),
        "workspace": str(actual_workspace),
        "runtime_storage": storage,
        "session_id": session_id,
        "token": token,
        "mode": mode,
        "actor": actor,
        "write_paths": write_paths,
        "write_scopes": scopes,
        "acquired_at": acquired_at,
        "evidence": evidence,
        "next_action": "re-read current project and Git state before continuing",
    }


def require_claim(
    connection: sqlite3.Connection, session_id: str, token: str
) -> dict[str, object]:
    row = connection.execute(
        "SELECT mode, actor, token_hash, workspace, write_paths_json, evidence_json "
        "FROM claims WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    if row is None:
        raise AccessError("active claim not found")
    if not secrets.compare_digest(row[2], token_digest(token)):
        raise AccessError("claim token does not match")
    return {
        "mode": row[0],
        "actor": row[1],
        "token_hash": row[2],
        "workspace": row[3],
        **claim_paths(row[0], row[4]),
        "evidence": json.loads(row[5]),
    }


def check_claim(
    project_root: Path, database: Path, session_id: str, token: str
) -> dict[str, object]:
    session_id = validate_session(session_id)
    if not database.exists():
        raise AccessError("runtime database does not exist")
    with closing(connect(database)) as connection:
        claim = require_claim(connection, session_id, token)
    workspace = Path(str(claim["workspace"]))
    evidence = git_evidence(workspace)
    if claim["mode"] == "scoped-writer":
        if is_link_or_junction(workspace) or not workspace.is_dir():
            raise AccessError("scoped-writer workspace no longer exists as a real directory")
        validate_write_scopes(workspace, list(claim["write_scopes"]))
    if claim["mode"] == "isolated-writer":
        if is_link_or_junction(workspace) or not workspace.is_dir():
            raise AccessError("isolated-writer workspace no longer exists as a real directory")
        reject_linked_write_paths(workspace, list(claim["write_paths"]))
        original = dict(claim["evidence"])
        if not evidence.get("git_backed") or not evidence.get("linked_worktree"):
            raise AccessError("isolated-writer workspace is no longer a linked Git worktree")
        if evidence.get("branch") == "detached" or evidence.get("operation_markers"):
            raise AccessError("isolated-writer branch or Git operation state is invalid")
        if (
            path_identity(str(evidence.get("git_dir")))
            != path_identity(str(original.get("git_dir")))
            or path_identity(str(evidence.get("git_common_dir")))
            != path_identity(str(original.get("git_common_dir")))
            or evidence.get("branch") != original.get("branch")
        ):
            raise AccessError("isolated-writer Git identity or branch changed after admission")
    return {
        "status": "active",
        "project_root": str(project_root),
        "session_id": session_id,
        "mode": claim["mode"],
        "actor": claim["actor"],
        "workspace": str(workspace),
        "write_paths": claim["write_paths"],
        "write_scopes": claim["write_scopes"],
        "evidence": evidence,
    }


def finish(
    project_root: Path,
    database: Path,
    session_id: str,
    token: str,
    outcome: str,
) -> dict[str, object]:
    session_id = validate_session(session_id)
    if not database.exists():
        raise AccessError("runtime database does not exist")
    connection = connect(database)
    try:
        transaction_boundary(connection, "BEGIN IMMEDIATE")
        claim = require_claim(connection, session_id, token)
        mode = str(claim["mode"])
        actor = str(claim["actor"])
        workspace = str(claim["workspace"])
        evidence = git_evidence(Path(workspace))
        now = utc_now()
        connection.execute(
            "INSERT INTO history(session_id, mode, actor, event, occurred_at, reason, evidence_json) "
            "VALUES(?, ?, ?, 'finished', ?, ?, ?)",
            (
                session_id,
                mode,
                actor,
                now,
                outcome,
                json.dumps(evidence, ensure_ascii=False, sort_keys=True),
            ),
        )
        connection.execute("DELETE FROM claims WHERE session_id = ?", (session_id,))
        connection.execute("DELETE FROM recovery_plans WHERE session_id = ?", (session_id,))
        transaction_boundary(connection, "COMMIT")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()
    return {
        "status": "finished",
        "project_root": str(project_root),
        "session_id": session_id,
        "mode": mode,
        "outcome": outcome,
    }


def recover(
    project_root: Path,
    database: Path,
    session_id: str,
    reason: str,
    apply: bool,
    token: str | None,
) -> dict[str, object]:
    session_id = validate_session(session_id)
    reason = reason.strip()
    if not reason:
        raise AccessError("recovery requires a non-empty reason")
    if not database.exists():
        raise AccessError("runtime database does not exist")
    connection = connect(database)
    try:
        transaction_boundary(connection, "BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT mode, actor, evidence_json, token_hash FROM claims WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            connection.execute("ROLLBACK")
            raise AccessError("active claim not found")
        if not apply:
            if token is not None:
                connection.execute("ROLLBACK")
                raise AccessError("recovery dry-run does not accept --token")
            recovery_token = secrets.token_hex(24)
            planned_at = utc_now()
            connection.execute(
                "INSERT OR REPLACE INTO recovery_plans(session_id, token_hash, claim_token_hash, reason, planned_at) "
                "VALUES(?, ?, ?, ?, ?)",
                (session_id, token_digest(recovery_token), row[3], reason, planned_at),
            )
            transaction_boundary(connection, "COMMIT")
            return {
                "status": "would_recover",
                "project_root": str(project_root),
                "session_id": session_id,
                "mode": row[0],
                "actor": row[1],
                "reason": reason,
                "recovery_token": recovery_token,
                "planned_at": planned_at,
            }
        if token is None:
            connection.execute("ROLLBACK")
            raise AccessError("recovery --apply requires the token from its dry-run")
        plan = connection.execute(
            "SELECT token_hash, claim_token_hash, reason FROM recovery_plans WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if (
            plan is None
            or not secrets.compare_digest(plan[0], token_digest(token))
            or not secrets.compare_digest(plan[1], row[3])
            or plan[2] != reason
        ):
            connection.execute("ROLLBACK")
            raise AccessError("recovery plan/token does not match the active claim and reason")
        now = utc_now()
        connection.execute(
            "INSERT INTO history(session_id, mode, actor, event, occurred_at, reason, evidence_json) "
            "VALUES(?, ?, ?, 'recovered', ?, ?, ?)",
            (session_id, row[0], row[1], now, reason, row[2]),
        )
        connection.execute("DELETE FROM claims WHERE session_id = ?", (session_id,))
        connection.execute("DELETE FROM recovery_plans WHERE session_id = ?", (session_id,))
        transaction_boundary(connection, "COMMIT")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()
    return {
        "status": "recovered",
        "project_root": str(project_root),
        "session_id": session_id,
        "reason": reason,
    }


def run_scoped(project_root, database, storage, actor, files, directories, command):
    """Keep a scoped claim only for one foreground command's lifetime."""
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise AccessError("run requires a command after --")
    receipt = enter(project_root, database, storage, "scoped-writer", None,
                    actor, [], None, files, directories)
    outcome = "aborted"
    try:
        check_claim(project_root, database, receipt["session_id"], receipt["token"])
        completed = subprocess.run(command, cwd=project_root, check=False)
        outcome = "success" if completed.returncode == 0 else "failed"
        return {"status": "command_finished", "exit_code": completed.returncode,
                "session_id": receipt["session_id"], "claim_released": True}
    finally:
        finish(project_root, database, receipt["session_id"], receipt["token"], outcome)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("status")
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--actor", required=True)
    run_parser.add_argument("--write-file", action="append", default=[])
    run_parser.add_argument("--write-dir", action="append", default=[])
    run_parser.add_argument("argv", nargs=argparse.REMAINDER)

    enter_parser = subparsers.add_parser("enter")
    enter_parser.add_argument(
        "--mode", choices=("read-only", "scoped-writer", "isolated-writer", "writer"), required=True
    )
    enter_parser.add_argument("--session")
    enter_parser.add_argument("--actor", required=True)
    enter_parser.add_argument("--registry-maintenance", action="store_true")
    enter_parser.add_argument("--write-path", action="append", default=[])
    enter_parser.add_argument("--write-file", action="append", default=[])
    enter_parser.add_argument("--write-dir", action="append", default=[])
    enter_parser.add_argument("--workspace", type=Path)

    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--session", required=True)
    check_parser.add_argument("--token", required=True)

    finish_parser = subparsers.add_parser("finish")
    finish_parser.add_argument("--session", required=True)
    finish_parser.add_argument("--token", required=True)
    finish_parser.add_argument("--outcome", choices=("success", "failed", "aborted"), required=True)

    recover_parser = subparsers.add_parser("recover")
    recover_parser.add_argument("--session", required=True)
    recover_parser.add_argument("--reason", required=True)
    recover_parser.add_argument("--apply", action="store_true")
    recover_parser.add_argument("--token")

    arguments = parser.parse_args()
    try:
        project_root, control, config = resolve_control(Path(__file__))
        if config.get("coordination_policy") == "worktree-first":
            # No database access: copied, corrupt or abandoned claims cannot gate work.
            result = {"status": "ready" if arguments.command == "status" else "not_required",
                      "protocol_version": PROTOCOL_VERSION, "coordination_policy": "worktree-first",
                      "admission_required": False, "legacy_registry_consulted": False,
                      "command_executed": False,
                      "next_action": "run the authorized task directly in its worktree or independent output; see ACCESS.md"}
            print(json.dumps(result, sort_keys=True))
            return 0
        runtime, storage = runtime_root(project_root, control, config)
        database = runtime / DATABASE_FILE
        ensure_runtime_boundary(database, create=False)
        if arguments.command == "status":
            result = status(project_root, database, storage)
        elif arguments.command == "run":
            result = run_scoped(project_root, database, storage, arguments.actor,
                                arguments.write_file, arguments.write_dir, arguments.argv)
        elif arguments.command == "enter":
            result = enter(
                project_root,
                database,
                storage,
                arguments.mode,
                arguments.session,
                arguments.actor,
                arguments.write_path,
                arguments.workspace,
                arguments.write_file,
                arguments.write_dir,
                arguments.registry_maintenance,
            )
        elif arguments.command == "check":
            result = check_claim(project_root, database, arguments.session, arguments.token)
        elif arguments.command == "finish":
            result = finish(
                project_root,
                database,
                arguments.session,
                arguments.token,
                arguments.outcome,
            )
        else:
            result = recover(
                project_root,
                database,
                arguments.session,
                arguments.reason,
                arguments.apply,
                arguments.token,
            )
    except AccessConflict as exc:
        print(
            json.dumps(
                {"status": "blocked", "reason": "active_claim_conflict", "claims": json.loads(str(exc))},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 2
    except (AccessError, OSError, sqlite3.Error, UnicodeError) as exc:
        print(
            json.dumps({"status": "error", "reason": str(exc)}, ensure_ascii=False, sort_keys=True),
            file=sys.stderr,
        )
        return 3
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    if arguments.command == "run":
        return result["exit_code"] if result["exit_code"] >= 0 else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
