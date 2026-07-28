import hashlib
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
        try:
            self._conn.autocommit = False
            with self._conn.cursor() as cur:
                cur.execute(
                    sql.SQL("SET search_path TO {}").format(
                        sql.Identifier(self.schema)
                    )
                )
        except Exception:
            # Never keep a connection we failed to initialise — a leak here
            # shrinks the pool permanently until the app stops serving.
            _pool.putconn(self._conn, close=True)
            self._conn = None
            raise
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # The connection MUST return to the pool no matter what commit or
        # rollback does: a dead TCP session raises InterfaceError on both,
        # and before this try/finally each such error leaked one pooled
        # connection until the pool was exhausted (issue #92).
        conn, self._conn = self._conn, None
        broken = False
        try:
            if exc_type:
                conn.rollback()
            else:
                conn.commit()
        except Exception:
            broken = True
            if exc_type is None:
                # A failed COMMIT means the write did not happen; the caller
                # must hear about it rather than assume success.
                raise
        finally:
            _pool.putconn(conn, close=broken or bool(conn.closed))

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
                     language: str = 'en', province: str = 'ON',
                     origin: str = 'lawyer') -> dict:
        return self.fetchone("""
            INSERT INTO ew_will_drafts
                (client_first_name, client_last_name, client_email, client_phone, language, province, status, origin)
            VALUES (%s, %s, %s, %s, %s, %s, 'link_sent', %s)
            RETURNING *
        """, (client_first_name, client_last_name, client_email, client_phone, language, province, origin))

    def get_draft(self, draft_id: str) -> dict:
        return self.fetchone(
            "SELECT * FROM ew_will_drafts WHERE id = %s",
            (draft_id,)
        )

    def update_draft(self, draft_id: str, updates: dict,
                     expected_revision: int = None) -> dict:
        allowed = {
            'status', 'tier', 'will_type', 'language', 'province',
            'current_step', 'completed_steps', 'tier2_clauses',
            'lawyer_notes', 'design_decisions', 'submitted_at',
            'reviewed_at', 'approved_at',
            'client_first_name', 'client_last_name', 'client_email', 'client_phone',
            'liabilities', 'reminder_preferences', 'ghl_contact_id',
            'reminders_synced_at',
            # Questionnaire section answers (JSONB) — feed the document generator.
            'about_you', 'your_family', 'your_estate', 'your_arrangements',
            'poa_property', 'poa_personal_care',
            # Conversational AI-intake snapshot (JSONB).
            'vault',
            # Payments.
            'payment_status', 'payment_tier', 'paid_at', 'payment_ref',
        }
        safe = {k: v for k, v in updates.items() if k in allowed}
        if not safe:
            return self.get_draft(draft_id)

        set_clauses = ', '.join(f"{k} = %s" for k in safe)
        set_clauses += ", updated_at = now(), revision = revision + 1"
        values = list(safe.values()) + [draft_id]

        # Optimistic concurrency (issue #92): a caller that read the draft at
        # revision N may demand the row is still at N. Zero rows updated means
        # someone else wrote in between — the caller gets None and must
        # re-read rather than silently overwrite the other writer's answers.
        if expected_revision is not None:
            values.append(expected_revision)
            return self.fetchone(
                f"UPDATE ew_will_drafts SET {set_clauses} "
                f"WHERE id = %s AND revision = %s RETURNING *",
                values
            )

        return self.fetchone(
            f"UPDATE ew_will_drafts SET {set_clauses} WHERE id = %s RETURNING *",
            values
        )

    def save_reminder_preferences(
        self,
        draft_id: str,
        preferences: dict,
        ghl_contact_id: str = None,
        synced: bool = False,
    ) -> dict:
        return self.fetchone("""
            UPDATE ew_will_drafts
            SET reminder_preferences = %s,
                ghl_contact_id = COALESCE(%s, ghl_contact_id),
                reminders_synced_at = CASE WHEN %s THEN now() ELSE reminders_synced_at END,
                updated_at = now()
            WHERE id = %s
            RETURNING *
        """, (
            psycopg2.extras.Json(preferences),
            ghl_contact_id,
            synced,
            draft_id,
        ))

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

    def count_drafts(self, status: str = None) -> int:
        """Return the full filtered count, independent of pagination."""
        if status:
            row = self.fetchone(
                "SELECT COUNT(*) AS total FROM ew_will_drafts WHERE status = %s",
                (status,),
            )
        else:
            row = self.fetchone("SELECT COUNT(*) AS total FROM ew_will_drafts")
        return int(row["total"])

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

    # ── AI Usage ─────────────────────────────────────────────────────────────

    def record_ai_usage(
        self,
        *,
        provider: str,
        model: str,
        feature: str,
        draft_id: str = None,
        request_count: int = 1,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_read_input_tokens: int = 0,
        cache_creation_input_tokens: int = 0,
        latency_ms: int = None,
        correlation_id: str = None,
        metadata: dict = None,
    ) -> dict:
        """Persist one metered AI feature invocation.

        Token fields are non-overlapping: cached input is removed from a
        provider's general input count before this method is called.
        """
        return self.fetchone("""
            INSERT INTO ew_ai_usage_events
                (draft_id, provider, model, feature, request_count,
                 input_tokens, output_tokens, cache_read_input_tokens,
                 cache_creation_input_tokens, latency_ms, correlation_id,
                 metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            draft_id,
            provider,
            model,
            feature,
            max(1, int(request_count or 1)),
            max(0, int(input_tokens or 0)),
            max(0, int(output_tokens or 0)),
            max(0, int(cache_read_input_tokens or 0)),
            max(0, int(cache_creation_input_tokens or 0)),
            max(0, int(latency_ms)) if latency_ms is not None else None,
            correlation_id,
            psycopg2.extras.Json(metadata or {}),
        ))

    def get_ai_usage_totals(self, since=None) -> dict:
        where = "WHERE created_at >= %s" if since is not None else ""
        params = (since,) if since is not None else None
        return self.fetchone(f"""
            SELECT
                COUNT(*) AS events,
                COALESCE(SUM(request_count), 0) AS requests,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
                COALESCE(SUM(cache_creation_input_tokens), 0) AS cache_creation_input_tokens,
                COALESCE(SUM(
                    input_tokens + output_tokens + cache_read_input_tokens +
                    cache_creation_input_tokens
                ), 0) AS total_tokens
            FROM ew_ai_usage_events
            {where}
        """, params)

    def get_ai_usage_tracked_since(self):
        row = self.fetchone(
            "SELECT MIN(created_at) AS tracked_since FROM ew_ai_usage_events"
        )
        return row.get("tracked_since") if row else None

    def get_ai_usage_by_model(self, since=None) -> list:
        where = "WHERE created_at >= %s" if since is not None else ""
        params = (since,) if since is not None else None
        return self.fetchall(f"""
            SELECT
                COUNT(*) AS events,
                provider,
                model,
                COALESCE(SUM(request_count), 0) AS requests,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
                COALESCE(SUM(cache_creation_input_tokens), 0) AS cache_creation_input_tokens,
                COALESCE(SUM(
                    input_tokens + output_tokens + cache_read_input_tokens +
                    cache_creation_input_tokens
                ), 0) AS total_tokens
            FROM ew_ai_usage_events
            {where}
            GROUP BY provider, model
            ORDER BY total_tokens DESC, provider, model
        """, params)

    def get_ai_usage_daily(self, since=None) -> list:
        where = "WHERE created_at >= %s" if since is not None else ""
        params = (since,) if since is not None else None
        return self.fetchall(f"""
            SELECT
                COUNT(*) AS events,
                (created_at AT TIME ZONE 'America/Toronto')::date AS date,
                COALESCE(SUM(request_count), 0) AS requests,
                COALESCE(SUM(input_tokens), 0) AS input_tokens,
                COALESCE(SUM(output_tokens), 0) AS output_tokens,
                COALESCE(SUM(cache_read_input_tokens), 0) AS cache_read_input_tokens,
                COALESCE(SUM(cache_creation_input_tokens), 0) AS cache_creation_input_tokens,
                COALESCE(SUM(
                    input_tokens + output_tokens + cache_read_input_tokens +
                    cache_creation_input_tokens
                ), 0) AS total_tokens
            FROM ew_ai_usage_events
            {where}
            GROUP BY (created_at AT TIME ZONE 'America/Toronto')::date
            ORDER BY date
        """, params)

    def list_ai_usage_events(self, since=None, limit: int = 50) -> list:
        where = "WHERE u.created_at >= %s" if since is not None else ""
        params = (since, limit) if since is not None else (limit,)
        return self.fetchall(f"""
            SELECT
                u.id,
                u.draft_id,
                u.provider,
                u.model,
                u.feature,
                u.request_count,
                u.input_tokens,
                u.output_tokens,
                u.cache_read_input_tokens,
                u.cache_creation_input_tokens,
                (u.input_tokens + u.output_tokens + u.cache_read_input_tokens +
                 u.cache_creation_input_tokens) AS total_tokens,
                u.latency_ms,
                u.created_at,
                NULLIF(TRIM(CONCAT_WS(' ', d.client_first_name, d.client_last_name)), '') AS client_name
            FROM ew_ai_usage_events u
            LEFT JOIN ew_will_drafts d ON d.id = u.draft_id
            {where}
            ORDER BY u.created_at DESC
            LIMIT %s
        """, params)

    # ── Client Links ─────────────────────────────────────────────────────────

    def create_link(self, draft_id: str, client_email: str = None, client_name: str = None) -> dict:
        return self.fetchone("""
            INSERT INTO ew_client_links (draft_id, client_email, client_name)
            VALUES (%s, %s, %s)
            RETURNING *
        """, (draft_id, client_email, client_name))

    def resolve_link(self, token: str) -> dict:
        # client_email/client_phone are intentionally NOT selected: resolve
        # answers to a bare token and must never return contact PII (#77).
        return self.fetchone("""
            SELECT l.*, d.status as draft_status, d.language, d.current_step,
                   d.completed_steps, d.vault, d.revision
            FROM ew_client_links l
            JOIN ew_will_drafts d ON d.id = l.draft_id
            WHERE l.token = %s
              AND l.revoked = false
              AND l.expires_at > now()
        """, (token,))

    # ── Clause Selections ─────────────────────────────────────────────────────

    def save_clause_selections(self, draft_id: str, document_type: str, clauses: list) -> bool:
        """Save all clause selections for a draft + document type (delete + insert).

        Every clause save REVOKES any lawyer approval for this document.
        The review portal renders the LIVE clause selections, so without
        this an approved document could be silently edited and the edited
        text would reach the client under the old approval — document A
        approved, document B delivered. The approval must be re-given on
        the text the client will actually see.
        """
        with self._conn.cursor() as cur:
            cur.execute("""
                UPDATE ew_document_configs
                SET lawyer_approved_at = NULL, lawyer_approved_by = NULL,
                    updated_at = now()
                WHERE draft_id = %s AND document_type = %s
                  AND lawyer_approved_at IS NOT NULL
            """, (draft_id, document_type))
            cur.execute(
                "DELETE FROM ew_clause_selections WHERE draft_id = %s AND document_type = %s",
                (draft_id, document_type)
            )
        for c in clauses:
            self.execute("""
                INSERT INTO ew_clause_selections
                    (draft_id, document_type, clause_id, included, custom_text,
                     template_text, title, is_folder, ai_generated, sort_order)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                draft_id, document_type,
                c['clause_id'], c.get('included', True),
                c.get('custom_text'),
                c.get('template_text'), c.get('title'),
                c.get('is_folder', False),
                c.get('ai_generated', False),
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

    # ── Firm Settings ─────────────────────────────────────────────────────────

    def get_firm_settings(self) -> dict:
        """Return the firm's settings blob (single row per schema), or {}."""
        row = self.fetchone(
            "SELECT settings FROM ew_firm_settings ORDER BY updated_at DESC LIMIT 1"
        )
        return dict(row).get("settings") or {} if row else {}

    def upsert_firm_settings(self, settings: dict) -> dict:
        """Persist the firm settings blob (single row per schema)."""
        existing = self.fetchone("SELECT id FROM ew_firm_settings LIMIT 1")
        if existing:
            row = self.fetchone(
                "UPDATE ew_firm_settings SET settings = %s, updated_at = now() "
                "WHERE id = %s RETURNING settings",
                (psycopg2.extras.Json(settings), existing["id"]),
            )
        else:
            row = self.fetchone(
                "INSERT INTO ew_firm_settings (settings) VALUES (%s) RETURNING settings",
                (psycopg2.extras.Json(settings),),
            )
        return dict(row).get("settings") or {}

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

    def set_lawyer_approval(self, draft_id: str, document_type: str,
                            approved_by: str) -> dict:
        """Record a lawyer's explicit approval of one generated document (#86).

        The approval is BOUND to the newest stored generation (id + SHA-256):
        the file can always show exactly which bytes the lawyer approved,
        and any later mismatch is detectable. Clause edits and regeneration
        both revoke the approval regardless.
        """
        latest = self.fetchone("""
            SELECT id, content_sha256 FROM ew_document_generations
            WHERE draft_id = %s AND document_type = %s
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        """, (draft_id, document_type))
        return self.fetchone("""
            UPDATE ew_document_configs
            SET lawyer_approved_at = now(), lawyer_approved_by = %s,
                lawyer_approved_generation_id = %s,
                lawyer_approved_sha256 = %s,
                updated_at = now()
            WHERE draft_id = %s AND document_type = %s
              AND generated_at IS NOT NULL
            RETURNING document_type, lawyer_approved_at, lawyer_approved_by,
                      lawyer_approved_generation_id, lawyer_approved_sha256
        """, (
            approved_by,
            (latest or {}).get("id"),
            (latest or {}).get("content_sha256"),
            draft_id, document_type,
        ))

    # ── Client follow-up questions (#98) ──────────────────────────────────────

    def create_client_question(self, draft_id: str, question_text: str,
                               required: bool = False,
                               document_type: str = None,
                               clause_id: str = None,
                               section: str = None,
                               asked_by: str = "dashboard") -> dict:
        return self.fetchone("""
            INSERT INTO ew_client_questions
                (draft_id, question_text, required, document_type,
                 clause_id, section, asked_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (draft_id, question_text, required, document_type,
              clause_id, section, asked_by))

    def get_client_questions(self, draft_id: str) -> list:
        return self.fetchall("""
            SELECT * FROM ew_client_questions
            WHERE draft_id = %s
            ORDER BY created_at DESC
        """, (draft_id,))

    def answer_client_question(self, draft_id: str, question_id: str,
                               answer_text: str) -> dict:
        """Client answers (draft-scoped so one client cannot answer
        another's question through a guessed id)."""
        return self.fetchone("""
            UPDATE ew_client_questions
            SET answer_text = %s, status = 'answered', answered_at = now()
            WHERE id = %s AND draft_id = %s AND status != 'resolved'
            RETURNING *
        """, (answer_text, question_id, draft_id))

    def resolve_client_question(self, draft_id: str, question_id: str,
                                resolution_note: str = None) -> dict:
        return self.fetchone("""
            UPDATE ew_client_questions
            SET status = 'resolved', resolved_at = now(),
                resolution_note = COALESCE(%s, resolution_note)
            WHERE id = %s AND draft_id = %s
            RETURNING *
        """, (resolution_note, question_id, draft_id))

    def unresolved_required_questions(self, draft_id: str,
                                      document_type: str = None) -> list:
        """Required questions that must be resolved before approval:
        unscoped questions block every document; scoped ones block theirs."""
        return self.fetchall("""
            SELECT * FROM ew_client_questions
            WHERE draft_id = %s AND required = true AND status != 'resolved'
              AND (document_type IS NULL OR document_type = %s)
        """, (draft_id, document_type))

    def revoke_lawyer_approval(self, draft_id: str, document_type: str) -> bool:
        """Withdraw approval — e.g. after re-generating with changed clauses."""
        self.execute("""
            UPDATE ew_document_configs
            SET lawyer_approved_at = NULL, lawyer_approved_by = NULL,
                updated_at = now()
            WHERE draft_id = %s AND document_type = %s
        """, (draft_id, document_type))
        return True

    def update_document_generated(self, draft_id: str, document_type: str, file_path: str) -> bool:
        """Mark a document as generated with its file path.

        UPSERT, not UPDATE: most drafts never get an explicit config row (the
        document picker only writes one on manual toggle), and the plain
        UPDATE matched zero rows for them — generated_at was never recorded,
        which made lawyer approval (#86) structurally impossible on the
        default path. Caught by the end-to-end journey test.

        Re-generation clears any prior lawyer approval: the approved text no
        longer exists, so approval must be given again on the new bytes.
        """
        self.execute("""
            INSERT INTO ew_document_configs
                (draft_id, document_type, enabled, generated_at,
                 generated_file_path)
            VALUES (%s, %s, true, now(), %s)
            ON CONFLICT (draft_id, document_type) DO UPDATE SET
                generated_at = now(),
                generated_file_path = EXCLUDED.generated_file_path,
                lawyer_approved_at = NULL,
                lawyer_approved_by = NULL,
                updated_at = now()
        """, (draft_id, document_type, file_path))
        return True

    # ── Document generations (audit trail) ────────────────────────────────────

    def record_document_generation(
        self,
        draft_id: str,
        document_type: str,
        file_format: str,
        content: bytes,
        generated_by: str = "dashboard",
        params: dict = None,
    ) -> dict:
        """Persist the exact bytes of a delivered document plus a checksum.

        This is the legal audit trail: what the system actually produced for
        this draft, verifiable later against any copy a client holds.
        """
        digest = hashlib.sha256(content).hexdigest()
        # clock_timestamp(), not the default now(): a generate-all batch
        # inserts several rows in one transaction, and now() would stamp them
        # all with the same transaction time, making audit order ambiguous.
        row = self.fetchone("""
            INSERT INTO ew_document_generations
                (draft_id, document_type, format, generation_params,
                 generated_by, content, content_sha256, byte_size, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, clock_timestamp())
            RETURNING id, created_at
        """, (
            draft_id, document_type, file_format,
            psycopg2.extras.Json(params or {}), generated_by,
            psycopg2.Binary(content), digest, len(content),
        ))
        storage_path = f"db://ew_document_generations/{row['id']}"
        self.execute(
            "UPDATE ew_document_generations SET storage_path = %s WHERE id = %s",
            (storage_path, row["id"]),
        )
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "storage_path": storage_path,
            "content_sha256": digest,
            "byte_size": len(content),
        }

    def get_document_generations(self, draft_id: str) -> list:
        """List the audit trail for a draft — metadata only, never the bytes."""
        return self.fetchall("""
            SELECT id, draft_id, document_type, format, storage_path,
                   content_sha256, byte_size, generation_params, generated_by,
                   created_at
            FROM ew_document_generations
            WHERE draft_id = %s
            ORDER BY created_at DESC, id DESC
        """, (draft_id,))

    def get_document_generation_content(self, generation_id: str) -> dict:
        """Fetch one stored generation including its bytes."""
        return self.fetchone("""
            SELECT id, draft_id, document_type, format, content,
                   content_sha256, byte_size, created_at
            FROM ew_document_generations
            WHERE id = %s
        """, (generation_id,))

    # ── Signing / execution events ───────────────────────────────────────────

    def upsert_signing_event(self, draft_id: str, document_type: str, data: dict) -> dict:
        """Record (or update) how a document was executed — Ontario SLRA s.4
        (in person) or s.21.1 (remote video), witnesses, date and location."""
        w1 = data.get('witness1') or {}
        w2 = data.get('witness2') or {}
        return self.fetchone("""
            INSERT INTO ew_signing_events
                (draft_id, document_type, signing_method, signed_at, location,
                 witness1_name, witness1_address, witness1_occupation, witness1_is_lso,
                 witness2_name, witness2_address, witness2_occupation, witness2_is_lso,
                 platform, recording_url)
            VALUES (%s,%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s,%s, %s,%s)
            ON CONFLICT (draft_id, document_type) DO UPDATE SET
                signing_method = EXCLUDED.signing_method,
                signed_at = EXCLUDED.signed_at,
                location = EXCLUDED.location,
                witness1_name = EXCLUDED.witness1_name,
                witness1_address = EXCLUDED.witness1_address,
                witness1_occupation = EXCLUDED.witness1_occupation,
                witness1_is_lso = EXCLUDED.witness1_is_lso,
                witness2_name = EXCLUDED.witness2_name,
                witness2_address = EXCLUDED.witness2_address,
                witness2_occupation = EXCLUDED.witness2_occupation,
                witness2_is_lso = EXCLUDED.witness2_is_lso,
                platform = EXCLUDED.platform,
                recording_url = EXCLUDED.recording_url
            RETURNING *
        """, (
            draft_id, document_type, data.get('signing_method', 'in_person'),
            data.get('signed_at'), data.get('location'),
            w1.get('name'), w1.get('address'), w1.get('occupation'), bool(w1.get('is_lso', False)),
            w2.get('name'), w2.get('address'), w2.get('occupation'), bool(w2.get('is_lso', False)),
            data.get('platform'), data.get('recording_url'),
        ))

    def get_signing_events(self, draft_id: str) -> list:
        """All recorded signing/execution events for a draft."""
        return self.fetchall(
            "SELECT * FROM ew_signing_events WHERE draft_id = %s ORDER BY document_type",
            (draft_id,)
        )

    # ── Client Links ─────────────────────────────────────────────────────────

    # ── Liabilities ──────────────────────────────────────────────────────────

    def save_liabilities(self, draft_id: str, liabilities: list) -> bool:
        """Save liabilities to draft JSONB column."""
        self.execute(
            "UPDATE ew_will_drafts SET liabilities = %s, updated_at = now() WHERE id = %s",
            (psycopg2.extras.Json(liabilities), draft_id)
        )
        return True

    def get_liabilities(self, draft_id: str) -> list:
        """Get liabilities from draft."""
        row = self.fetchone(
            "SELECT liabilities FROM ew_will_drafts WHERE id = %s",
            (draft_id,)
        )
        if row and row.get('liabilities'):
            return row['liabilities']
        return []

    # ── Review ─────────────────────────────────────────────────────────────

    def save_review_approval(self, draft_id: str, document_type: str, approved_by: str) -> bool:
        """Upsert review approval."""
        self.execute("""
            INSERT INTO ew_review_approvals (draft_id, document_type, approved_by, approved_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (draft_id, document_type) DO UPDATE SET
                approved_at = now(),
                approved_by = EXCLUDED.approved_by
        """, (draft_id, document_type, approved_by))
        return True

    def get_review_approvals(self, draft_id: str) -> list:
        """Get all approvals for a draft."""
        return self.fetchall(
            "SELECT * FROM ew_review_approvals WHERE draft_id = %s ORDER BY approved_at",
            (draft_id,)
        )

    def save_review_comment(self, draft_id: str, document_type: str,
                            clause_id: str, comment_text: str,
                            commenter_name: str) -> dict:
        """Insert a review comment, return the created record."""
        return self.fetchone("""
            INSERT INTO ew_review_comments
                (draft_id, document_type, clause_id, comment_text, commenter_name)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (draft_id, document_type, clause_id, comment_text, commenter_name))

    def get_review_comments(self, draft_id: str, document_type: str = None) -> list:
        """Get review comments, optionally filtered by document_type."""
        if document_type:
            return self.fetchall(
                "SELECT * FROM ew_review_comments WHERE draft_id = %s AND document_type = %s ORDER BY created_at",
                (draft_id, document_type)
            )
        return self.fetchall(
            "SELECT * FROM ew_review_comments WHERE draft_id = %s ORDER BY created_at",
            (draft_id,)
        )

    # ── Review Links ───────────────────────────────────────────────────────

    def create_review_link(self, draft_id: str, client_name: str, language: str = 'en') -> dict:
        """Create a review portal magic link (link_type='review')."""
        return self.fetchone("""
            INSERT INTO ew_client_links (draft_id, client_name, link_type)
            VALUES (%s, %s, 'review')
            RETURNING *
        """, (draft_id, client_name))

    def resolve_review_link(self, token: str) -> dict:
        """Resolve a review link token."""
        return self.fetchone("""
            SELECT l.*, d.status as draft_status, d.language, d.current_step, d.completed_steps
            FROM ew_client_links l
            JOIN ew_will_drafts d ON d.id = l.draft_id
            WHERE l.token = %s
              AND l.link_type = 'review'
              AND l.revoked = false
              AND l.expires_at > now()
        """, (token,))

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

    # ── Delivery log (#88) ────────────────────────────────────────────────────

    def record_delivery(self, draft_id: str, kind: str, channel: str,
                        status: str, provider_mode: str = None) -> dict:
        """Persist one delivery attempt. 'not_requested' is not an attempt
        and is deliberately not recordable."""
        return self.fetchone("""
            INSERT INTO ew_delivery_log
                (draft_id, kind, channel, status, provider_mode)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (draft_id, kind, channel, status, provider_mode))

    def get_delivery_log(self, draft_id: str) -> list:
        return self.fetchall("""
            SELECT * FROM ew_delivery_log
            WHERE draft_id = %s
            ORDER BY created_at DESC
            LIMIT 50
        """, (draft_id,))
