import os
import psycopg2
import psycopg2.pool
import psycopg2.extras
from psycopg2 import sql
import re
import logging

logger = logging.getLogger(__name__)

_pool = None
TENANT_REGEX = re.compile(r'^firm_[a-z0-9_]+$')

def init_pool():
    global _pool
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=2,
        maxconn=10,
        dsn=os.getenv("DATABASE_URL", "postgresql://localhost/caselawvision")
    )
    logger.info("EZWill DB pool initialized")

def close_pool():
    global _pool
    if _pool:
        _pool.closeall()

def get_pool():
    return _pool

def validate_schema(schema: str) -> str:
    if not TENANT_REGEX.match(schema):
        raise ValueError(f"Invalid schema: {schema}")
    return schema

class EWDbWriter:
    """Tenant-aware database writer for ew_* tables."""

    def __init__(self, schema: str):
        self.schema = validate_schema(schema)
        self._conn = None

    def __enter__(self):
        self._conn = _pool.getconn()
        self._conn.autocommit = False
        with self._conn.cursor() as cur:
            cur.execute(
                sql.SQL("SET search_path TO {}").format(
                    sql.Identifier(self.schema)
                )
            )
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self._conn.rollback()
        else:
            self._conn.commit()
        _pool.putconn(self._conn)
        self._conn = None

    def execute(self, query: str, params=None):
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            return cur

    def fetchone(self, query: str, params=None):
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchone()

    def fetchall(self, query: str, params=None):
        with self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()

    # ── Will Drafts ─────────────────────────────────────────────────────────

    def create_draft(self, client_first_name: str, client_last_name: str,
                     client_email: str = None, client_phone: str = None,
                     language: str = 'en') -> dict:
        return self.fetchone("""
            INSERT INTO ew_will_drafts
                (client_first_name, client_last_name, client_email, client_phone, language, status)
            VALUES (%s, %s, %s, %s, %s, 'link_sent')
            RETURNING *
        """, (client_first_name, client_last_name, client_email, client_phone, language))

    def get_draft(self, draft_id: str) -> dict:
        return self.fetchone(
            "SELECT * FROM ew_will_drafts WHERE id = %s",
            (draft_id,)
        )

    def update_draft(self, draft_id: str, updates: dict) -> dict:
        allowed = {
            'status', 'tier', 'will_type', 'language', 'province',
            'current_step', 'completed_steps', 'tier2_clauses',
            'lawyer_notes', 'design_decisions', 'submitted_at',
            'reviewed_at', 'approved_at',
            'client_first_name', 'client_last_name', 'client_email', 'client_phone',
        }
        safe = {k: v for k, v in updates.items() if k in allowed}
        if not safe:
            return self.get_draft(draft_id)

        set_clauses = ', '.join(f"{k} = %s" for k in safe)
        set_clauses += ", updated_at = now()"
        values = list(safe.values()) + [draft_id]

        return self.fetchone(
            f"UPDATE ew_will_drafts SET {set_clauses} WHERE id = %s RETURNING *",
            values
        )

    def list_drafts(self, limit: int = 50, offset: int = 0, status: str = None) -> list:
        if status:
            return self.fetchall(
                "SELECT * FROM ew_will_drafts WHERE status = %s ORDER BY updated_at DESC LIMIT %s OFFSET %s",
                (status, limit, offset)
            )
        return self.fetchall(
            "SELECT * FROM ew_will_drafts ORDER BY updated_at DESC LIMIT %s OFFSET %s",
            (limit, offset)
        )

    def submit_draft(self, draft_id: str) -> dict:
        return self.fetchone("""
            UPDATE ew_will_drafts
            SET status = 'submitted', submitted_at = now(), updated_at = now()
            WHERE id = %s AND status IN ('in_progress', 'link_sent', 'opened')
            RETURNING *
        """, (draft_id,))

    # ── People ──────────────────────────────────────────────────────────────

    def upsert_people(self, draft_id: str, people: list) -> list:
        """Replace all people for a draft with new list."""
        with self._conn.cursor() as cur:
            cur.execute("DELETE FROM ew_people WHERE draft_id = %s", (draft_id,))

        result = []
        for i, p in enumerate(people):
            row = self.fetchone("""
                INSERT INTO ew_people
                    (draft_id, role, first_name, last_name, relationship, email, phone,
                     address, is_minor, birth_date, receives_odsp, is_us_person, percentage, sort_order, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (
                draft_id, p.get('role'), p.get('firstName', ''), p.get('lastName', ''),
                p.get('relationship'), p.get('email'), p.get('phone'),
                p.get('address'), p.get('isMinor', False), p.get('birthDate'),
                p.get('receivesODSP', False), p.get('isUSPerson', False),
                p.get('percentage'), i,
                psycopg2.extras.Json(p.get('metadata')) if p.get('metadata') else None
            ))
            result.append(row)
        return result

    def get_people(self, draft_id: str) -> list:
        return self.fetchall(
            "SELECT * FROM ew_people WHERE draft_id = %s ORDER BY sort_order",
            (draft_id,)
        )

    # ── Assets ──────────────────────────────────────────────────────────────

    def upsert_assets(self, draft_id: str, assets: list) -> list:
        with self._conn.cursor() as cur:
            cur.execute("DELETE FROM ew_assets WHERE draft_id = %s", (draft_id,))

        result = []
        for a in assets:
            row = self.fetchone("""
                INSERT INTO ew_assets
                    (draft_id, asset_type, description, estimated_value, address,
                     institution, account_number_last4, beneficiary_designation,
                     joint_owner_name, joint_owner_relationship, is_resp, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (
                draft_id, a.get('assetType'), a.get('description', ''),
                a.get('estimatedValue'), a.get('address'), a.get('institution'),
                a.get('accountNumber'), a.get('beneficiaryDesignation', False),
                a.get('jointOwnerName'), a.get('jointOwnerRelationship'),
                a.get('assetType') == 'resp',
                psycopg2.extras.Json(a) if a else None
            ))
            result.append(row)
        return result

    # ── AI Flags ─────────────────────────────────────────────────────────────

    def upsert_ai_flags(self, draft_id: str, flags: list) -> list:
        result = []
        for f in flags:
            row = self.fetchone("""
                INSERT INTO ew_ai_flags
                    (draft_id, flag_id, severity, title, title_ko, description, description_ko, statute, dismissed)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (draft_id, flag_id) DO UPDATE SET
                    severity = EXCLUDED.severity,
                    last_seen_at = now(),
                    dismissed = CASE WHEN ew_ai_flags.dismissed THEN ew_ai_flags.dismissed ELSE EXCLUDED.dismissed END
                RETURNING *
            """, (
                draft_id, f.get('id'), f.get('severity'),
                f.get('title'), f.get('titleKo'),
                f.get('description'), f.get('descriptionKo'),
                f.get('statute'), f.get('dismissed', False)
            ))
            result.append(row)
        return result

    # ── Client Links ─────────────────────────────────────────────────────────

    def create_link(self, draft_id: str, client_email: str = None, client_name: str = None) -> dict:
        return self.fetchone("""
            INSERT INTO ew_client_links (draft_id, client_email, client_name)
            VALUES (%s, %s, %s)
            RETURNING *
        """, (draft_id, client_email, client_name))

    def resolve_link(self, token: str) -> dict:
        return self.fetchone("""
            SELECT l.*, d.status as draft_status, d.language, d.current_step, d.completed_steps
            FROM ew_client_links l
            JOIN ew_will_drafts d ON d.id = l.draft_id
            WHERE l.token = %s
              AND l.revoked = false
              AND l.expires_at > now()
        """, (token,))

    # ── Clause Selections ─────────────────────────────────────────────────────

    def save_clause_selections(self, draft_id: str, document_type: str, clauses: list) -> bool:
        """Save all clause selections for a draft + document type (delete + insert)."""
        with self._conn.cursor() as cur:
            cur.execute(
                "DELETE FROM ew_clause_selections WHERE draft_id = %s AND document_type = %s",
                (draft_id, document_type)
            )
        for c in clauses:
            self.execute("""
                INSERT INTO ew_clause_selections
                    (draft_id, document_type, clause_id, included, custom_text, ai_generated, sort_order)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                draft_id, document_type,
                c['clause_id'], c.get('included', True),
                c.get('custom_text'), c.get('ai_generated', False),
                c.get('sort_order', 0)
            ))
        return True

    def get_clause_selections(self, draft_id: str, document_type: str) -> list:
        """Get clause selections for a draft + document type."""
        return self.fetchall(
            "SELECT * FROM ew_clause_selections WHERE draft_id = %s AND document_type = %s ORDER BY sort_order",
            (draft_id, document_type)
        )

    def get_all_clause_selections(self, draft_id: str) -> dict:
        """Get all clause selections for a draft, grouped by document_type."""
        rows = self.fetchall(
            "SELECT * FROM ew_clause_selections WHERE draft_id = %s ORDER BY document_type, sort_order",
            (draft_id,)
        )
        grouped = {}
        for row in rows:
            dt = row['document_type']
            if dt not in grouped:
                grouped[dt] = []
            grouped[dt].append(dict(row))
        return grouped

    def reset_clause_selections(self, draft_id: str, document_type: str) -> bool:
        """Delete all clause selections for a draft + document type."""
        self.execute(
            "DELETE FROM ew_clause_selections WHERE draft_id = %s AND document_type = %s",
            (draft_id, document_type)
        )
        return True

    # ── Document Configs ──────────────────────────────────────────────────────

    def save_document_config(self, draft_id: str, document_type: str, enabled: bool) -> bool:
        """Enable/disable a document type for a draft (upsert)."""
        self.execute("""
            INSERT INTO ew_document_configs (draft_id, document_type, enabled)
            VALUES (%s, %s, %s)
            ON CONFLICT (draft_id, document_type) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                updated_at = now()
        """, (draft_id, document_type, enabled))
        return True

    def get_document_configs(self, draft_id: str) -> list:
        """Get all document configs for a draft."""
        return self.fetchall(
            "SELECT * FROM ew_document_configs WHERE draft_id = %s ORDER BY document_type",
            (draft_id,)
        )

    def update_document_generated(self, draft_id: str, document_type: str, file_path: str) -> bool:
        """Mark a document as generated with its file path."""
        self.execute("""
            UPDATE ew_document_configs
            SET generated_at = now(), generated_file_path = %s, updated_at = now()
            WHERE draft_id = %s AND document_type = %s
        """, (file_path, draft_id, document_type))
        return True

    # ── Client Links ─────────────────────────────────────────────────────────

    def mark_link_opened(self, token: str):
        self.execute("""
            UPDATE ew_client_links SET opened_at = now() WHERE token = %s AND opened_at IS NULL
        """, (token,))
        # Also update draft status to 'opened' if still 'link_sent'
        link = self.fetchone("SELECT draft_id FROM ew_client_links WHERE token = %s", (token,))
        if link:
            self.execute("""
                UPDATE ew_will_drafts SET status = 'opened', updated_at = now()
                WHERE id = %s AND status = 'link_sent'
            """, (link['draft_id'],))
