"""
EZWill Document Generation Service
Generates professional DOCX documents from clause selections using python-docx.
Supports all 8 document types with table-based signing pages.
"""

import re
import io
import logging
from html.parser import HTMLParser
from datetime import date
from typing import Optional

from docx import Document
from docx.shared import Inches, Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml

logger = logging.getLogger(__name__)

# ── Constants ───────────────────────────────────────────────────────────────

FIRM_NAME = "VATURI & CHO LLP"
FIRM_ADDRESS_LINE1 = "1110 Finch Avenue West, Suite 310"
FIRM_ADDRESS_LINE2 = "Toronto, ON  M3J 2T2"

DOCUMENT_TITLES: dict[str, str] = {
    "probate_will": "LAST WILL AND TESTAMENT",
    "non_probate_will": "LAST WILL AND TESTAMENT (NON-PROBATE)",
    "poa_property": "CONTINUING POWER OF ATTORNEY FOR PROPERTY",
    "poa_personal_care": "POWER OF ATTORNEY FOR PERSONAL CARE",
    "affidavit_execution": "AFFIDAVIT OF EXECUTION",
    "affidavit_execution_np": "AFFIDAVIT OF EXECUTION (NON-PROBATE WILL)",
    "affidavit_execution_poa_prop": "AFFIDAVIT OF EXECUTION (POWER OF ATTORNEY FOR PROPERTY)",
    "affidavit_execution_poa_pc": "AFFIDAVIT OF EXECUTION (POWER OF ATTORNEY FOR PERSONAL CARE)",
}

WILL_TYPES = {"probate_will", "non_probate_will"}
POA_TYPES = {"poa_property", "poa_personal_care"}
AFFIDAVIT_TYPES = {
    "affidavit_execution", "affidavit_execution_np",
    "affidavit_execution_poa_prop", "affidavit_execution_poa_pc",
}

VARIABLE_PATTERN = re.compile(r"\{\{(\w+)\}\}")


# ── HTML Parser ─────────────────────────────────────────────────────────────

class _SimpleHTMLParser(HTMLParser):
    """Parses simple HTML and produces a list of (text, bold, italic, underline) runs."""

    def __init__(self):
        super().__init__()
        self.runs: list[tuple[str, bool, bool, bool]] = []
        self._bold = False
        self._italic = False
        self._underline = False

    def handle_starttag(self, tag: str, attrs):
        tag = tag.lower()
        if tag in ("b", "strong"):
            self._bold = True
        elif tag in ("i", "em"):
            self._italic = True
        elif tag == "u":
            self._underline = True

    def handle_endtag(self, tag: str):
        tag = tag.lower()
        if tag in ("b", "strong"):
            self._bold = False
        elif tag in ("i", "em"):
            self._italic = False
        elif tag == "u":
            self._underline = False

    def handle_data(self, data: str):
        if data:
            self.runs.append((data, self._bold, self._italic, self._underline))


# ── Helpers ─────────────────────────────────────────────────────────────────

def resolve_variables(text: str, variables: dict) -> str:
    """
    Replace {{variableName}} placeholders with values from variables dict.
    Unresolved placeholders become [variableName].
    """
    if not text:
        return text

    def _replace(match: re.Match) -> str:
        key = match.group(1)
        value = variables.get(key)
        if value is not None:
            return str(value)
        # Try camelCase -> snake_case lookup
        snake_key = re.sub(r"([A-Z])", r"_\1", key).lower().lstrip("_")
        value = variables.get(snake_key)
        if value is not None:
            return str(value)
        return f"[{key}]"

    return VARIABLE_PATTERN.sub(_replace, text)


def html_to_docx_runs(paragraph, html_text: str) -> None:
    """
    Parse simple HTML (<b>, <i>, <u>, <strong>, <em>) and add formatted runs
    to a python-docx paragraph. Falls back to plain text if no HTML tags found.
    """
    if not html_text:
        return

    if "<" not in html_text:
        paragraph.add_run(html_text)
        return

    parser = _SimpleHTMLParser()
    try:
        parser.feed(html_text)
    except Exception:
        paragraph.add_run(html_text)
        return

    if not parser.runs:
        paragraph.add_run(html_text)
        return

    for text, bold, italic, underline in parser.runs:
        run = paragraph.add_run(text)
        if bold:
            run.bold = True
        if italic:
            run.italic = True
        if underline:
            run.underline = True


def _strip_html(text: str) -> str:
    """Remove HTML tags, returning plain text."""
    if not text or "<" not in text:
        return text or ""
    return re.sub(r"<[^>]+>", "", text)


# ── Document Generator ──────────────────────────────────────────────────────

class DocumentGenerator:
    """
    Generates professional DOCX documents from clause selections.
    Supports all 8 Ontario estate-planning document types with
    table-based signing pages.
    """

    def generate_document(
        self,
        document_type: str,
        clauses: list[dict],
        variables: dict,
        signing_data: Optional[dict] = None,
    ) -> bytes:
        """
        Generate a DOCX file from clause selections and return it as bytes.

        Args:
            document_type: One of the 8 supported document types.
            clauses: List of clause dicts with keys: clause_id, included,
                     templateText, customText, sortOrder, isFolder, title.
            variables: Dict of placeholder variables to resolve.
            signing_data: Optional dict with signing-page specifics
                          (witness names, commissioner, etc.).

        Returns:
            The generated DOCX file content as bytes.
        """
        doc = Document()
        self._set_document_styles(doc)
        self._create_cover_page(doc, document_type, variables)

        # Filter and sort clauses
        included = [c for c in clauses if c.get("included", True)]
        included.sort(key=lambda c: c.get("sortOrder", c.get("sort_order", 0)))

        clause_number = 0
        for clause in included:
            is_folder = clause.get("isFolder", clause.get("is_folder", False))
            if is_folder:
                self._add_folder_heading(doc, clause, variables)
            else:
                clause_number += 1
                self._add_clause(doc, clause, variables, clause_number)

        # Signing pages
        if signing_data or document_type in WILL_TYPES | POA_TYPES | AFFIDAVIT_TYPES:
            sd = signing_data or {}
            self._create_signing_page(doc, document_type, sd, variables)

        # Schedule A for probate will
        if document_type == "probate_will":
            self._create_schedule_a(doc, variables)

        self._add_page_numbers(doc)

        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()

    # ── Cover Page ──────────────────────────────────────────────────────────

    def _create_cover_page(
        self, doc: Document, document_type: str, variables: dict
    ) -> None:
        """Add a firm-branded cover page."""
        # Firm name
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(FIRM_NAME)
        run.bold = True
        run.font.size = Pt(16)
        run.font.name = "Times New Roman"

        # Address
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(FIRM_ADDRESS_LINE1)
        run.font.size = Pt(10)
        run.font.name = "Times New Roman"

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(FIRM_ADDRESS_LINE2)
        run.font.size = Pt(10)
        run.font.name = "Times New Roman"

        doc.add_paragraph()  # spacer

        # Document title
        title = DOCUMENT_TITLES.get(document_type, document_type.upper().replace("_", " "))
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(title)
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = "Times New Roman"

        doc.add_paragraph()  # spacer

        # Client name
        client_name = (
            variables.get("testatorFullName")
            or variables.get("testator_full_name")
            or variables.get("clientFullName")
            or variables.get("client_full_name")
            or "[Client Name]"
        )
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(f"of  {client_name}")
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        doc.add_paragraph()  # spacer

        # Date
        doc_date = variables.get("documentDate") or date.today().strftime("%B %d, %Y")
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(doc_date)
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        # Page break after cover
        doc.add_page_break()

    # ── Folder Heading ──────────────────────────────────────────────────────

    def _add_folder_heading(
        self, doc: Document, clause: dict, variables: dict
    ) -> None:
        """Add a bold, caps folder heading (e.g. 'EXECUTORS AND TRUSTEES')."""
        title = clause.get("title", clause.get("clause_id", ""))
        title = resolve_variables(title, variables)

        p = doc.add_paragraph()
        p.space_before = Pt(18)
        p.space_after = Pt(6)
        run = p.add_run(title.upper())
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = "Times New Roman"

    # ── Clause Body ─────────────────────────────────────────────────────────

    def _add_clause(
        self, doc: Document, clause: dict, variables: dict, clause_number: int
    ) -> None:
        """
        Add a numbered clause to the document. Uses customText if present,
        otherwise resolves templateText.
        """
        # Determine the text to use
        raw_text = (
            clause.get("customText")
            or clause.get("custom_text")
            or clause.get("templateText")
            or clause.get("template_text")
            or ""
        )
        resolved = resolve_variables(raw_text, variables)

        # Clause number + title
        title = clause.get("title", "")
        if title:
            title = resolve_variables(title, variables)
            heading_p = doc.add_paragraph()
            heading_p.space_before = Pt(12)
            heading_p.space_after = Pt(4)
            run = heading_p.add_run(f"{clause_number}.  {title}")
            run.bold = True
            run.font.size = Pt(12)
            run.font.name = "Times New Roman"

        # Body text
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.5)
        p.space_after = Pt(6)

        # If no title, prefix with number in the body
        if not title:
            num_run = p.add_run(f"{clause_number}.  ")
            num_run.bold = True
            num_run.font.size = Pt(12)
            num_run.font.name = "Times New Roman"

        # Add the text, handling HTML if present
        if "<" in resolved:
            html_to_docx_runs(p, resolved)
        else:
            run = p.add_run(resolved)
            run.font.size = Pt(12)
            run.font.name = "Times New Roman"

    # ── Signing Pages ───────────────────────────────────────────────────────

    def _create_signing_page(
        self,
        doc: Document,
        document_type: str,
        signing_data: dict,
        variables: dict,
    ) -> None:
        """
        Create the signing page appropriate for the document type.
        Uses Word tables for precise spacing (critical for legal documents).
        """
        doc.add_page_break()

        if document_type in WILL_TYPES:
            self._signing_page_will(doc, document_type, signing_data, variables)
        elif document_type in POA_TYPES:
            self._signing_page_poa(doc, document_type, signing_data, variables)
        elif document_type in AFFIDAVIT_TYPES:
            self._signing_page_affidavit(doc, document_type, signing_data, variables)

    def _signing_page_will(
        self,
        doc: Document,
        document_type: str,
        signing_data: dict,
        variables: dict,
    ) -> None:
        """Testimonium block for wills with witness attestation."""
        testator_name = (
            variables.get("testatorFullName")
            or variables.get("testator_full_name")
            or "[TESTATOR NAME]"
        )
        pronoun = variables.get("pronoun", "his/her")
        will_type_label = "Primary" if document_type == "probate_will" else "Non-Probate"
        num_pages = signing_data.get("numberOfPages", variables.get("numberOfPages", "[__]"))

        # Testimonium heading
        p = doc.add_paragraph()
        p.space_before = Pt(24)
        run = p.add_run("TESTIMONIUM")
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = "Times New Roman"

        # Attestation table: left column = text with ), right column = signature
        table = doc.add_table(rows=7, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.columns[0].width = Inches(3.5)
        table.columns[1].width = Inches(3.0)

        # Remove table borders
        self._remove_table_borders(table)

        # Row 0
        left_lines = [
            f"SIGNED, PUBLISHED AND DECLARED  )",
            f"by the said Testator, {testator_name.upper()}  )",
            f"as {pronoun} {will_type_label}  )",
            f"Will, consisting of {num_pages} pages  )",
            f"including this page, in the  )",
            f"presence of us, both present  )",
            f"at the same time, who at  )",
            f"{pronoun} request, in {pronoun} presence  )",
            f"and in the presence of each  )",
            f"other have hereunto subscribed  )",
            f"our names as witnesses.  )",
        ]

        # Fill left column across rows
        for i, line in enumerate(left_lines):
            if i < len(table.rows):
                cell = table.cell(i, 0)
                cell.text = ""
                p = cell.paragraphs[0]
                run = p.add_run(line)
                run.font.size = Pt(11)
                run.font.name = "Times New Roman"

        # If we need more rows, add them
        while len(left_lines) > len(table.rows):
            table.add_row()

        # Re-fill if rows were added
        if len(left_lines) > 7:
            for i in range(7, len(left_lines)):
                cell = table.cell(i, 0)
                cell.text = ""
                p = cell.paragraphs[0]
                run = p.add_run(left_lines[i])
                run.font.size = Pt(11)
                run.font.name = "Times New Roman"

        # Right column: signature line in the middle row area
        sig_row = 4
        cell = table.cell(sig_row, 1)
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("_" * 30)
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        cell = table.cell(sig_row + 1, 1)
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(testator_name.upper())
        run.bold = True
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        doc.add_paragraph()  # spacer

        # Witness block
        p = doc.add_paragraph()
        run = p.add_run("WITNESSES:")
        run.bold = True
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        doc.add_paragraph()

        # Two witness blocks side by side
        w_table = doc.add_table(rows=4, cols=2)
        w_table.columns[0].width = Inches(3.25)
        w_table.columns[1].width = Inches(3.25)
        self._remove_table_borders(w_table)

        for col in range(2):
            labels = ["Name:", "Occupation:", "Address:", ""]
            for row_idx, label in enumerate(labels):
                cell = w_table.cell(row_idx, col)
                cell.text = ""
                p = cell.paragraphs[0]
                if label:
                    run = p.add_run(f"{label}  {'_' * 25}")
                    run.font.size = Pt(11)
                    run.font.name = "Times New Roman"

    def _signing_page_poa(
        self,
        doc: Document,
        document_type: str,
        signing_data: dict,
        variables: dict,
    ) -> None:
        """Signature block for Powers of Attorney."""
        grantor_name = (
            variables.get("testatorFullName")
            or variables.get("testator_full_name")
            or "[GRANTOR NAME]"
        )
        doc_label = (
            "Continuing Power of Attorney for Property"
            if document_type == "poa_property"
            else "Power of Attorney for Personal Care"
        )

        # Heading
        p = doc.add_paragraph()
        p.space_before = Pt(24)
        run = p.add_run("EXECUTION")
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = "Times New Roman"

        # Execution text
        p = doc.add_paragraph()
        p.space_before = Pt(12)
        text = (
            f"IN WITNESS WHEREOF, I, {grantor_name.upper()}, have hereunto set "
            f"my hand and seal to this {doc_label}."
        )
        run = p.add_run(text)
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        doc.add_paragraph()

        # Signature table
        table = doc.add_table(rows=5, cols=2)
        table.columns[0].width = Inches(3.5)
        table.columns[1].width = Inches(3.0)
        self._remove_table_borders(table)

        # Left: date line
        cell = table.cell(0, 0)
        cell.text = ""
        p = cell.paragraphs[0]
        run = p.add_run(f"Date: {'_' * 25}")
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        # Right: signature line
        cell = table.cell(0, 1)
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("_" * 30)
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        cell = table.cell(1, 1)
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(grantor_name.upper())
        run.bold = True
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        doc.add_paragraph()

        # Witness block
        p = doc.add_paragraph()
        run = p.add_run("WITNESS:")
        run.bold = True
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        doc.add_paragraph()

        for label in ["Name:", "Occupation:", "Address:"]:
            p = doc.add_paragraph()
            run = p.add_run(f"{label}  {'_' * 40}")
            run.font.size = Pt(11)
            run.font.name = "Times New Roman"

    def _signing_page_affidavit(
        self,
        doc: Document,
        document_type: str,
        signing_data: dict,
        variables: dict,
    ) -> None:
        """Jurat and commissioner block for affidavits of execution."""
        deponent_name = (
            signing_data.get("deponentName")
            or variables.get("deponentName")
            or variables.get("otherWitnessName")
            or variables.get("other_witness_name")
            or "[DEPONENT NAME]"
        )
        commissioner_name = (
            signing_data.get("commissionerName")
            or variables.get("commissionerName")
            or variables.get("commissioner_name")
            or "[COMMISSIONER NAME]"
        )
        city = (
            variables.get("city")
            or variables.get("cityName")
            or variables.get("city_name")
            or "[City]"
        )
        province = variables.get("province", "Ontario")

        # Heading
        p = doc.add_paragraph()
        p.space_before = Pt(24)
        run = p.add_run("AFFIDAVIT OF EXECUTION")
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = "Times New Roman"
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        doc.add_paragraph()

        # Affidavit body
        p = doc.add_paragraph()
        run = p.add_run(
            f"I, {deponent_name.upper()}, of the City of {city}, "
            f"in the Province of {province}, MAKE OATH AND SAY:"
        )
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        doc.add_paragraph()

        # Numbered affidavit paragraphs
        testator_name = (
            variables.get("testatorFullName")
            or variables.get("testator_full_name")
            or "[TESTATOR NAME]"
        )
        pronoun = variables.get("pronoun", "his/her")

        affidavit_paras = [
            (
                f"1.  I was present and saw {testator_name.upper()} named "
                f"in the within instrument sign the instrument."
            ),
            (
                f"2.  {testator_name.upper()} signed the instrument in my "
                f"presence and in the presence of the other subscribing witness."
            ),
            (
                f"3.  I know {testator_name.upper()} to be the person whose name "
                f"is signed to the instrument as its maker."
            ),
            f"4.  I am the subscribing witness to the instrument.",
            (
                f"5.  I am over the age of eighteen (18) years and I believe that "
                f"I am mentally competent to be a witness."
            ),
        ]

        for text in affidavit_paras:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.5)
            p.space_after = Pt(6)
            run = p.add_run(text)
            run.font.size = Pt(12)
            run.font.name = "Times New Roman"

        doc.add_paragraph()

        # Jurat table
        jurat_table = doc.add_table(rows=6, cols=2)
        jurat_table.columns[0].width = Inches(3.5)
        jurat_table.columns[1].width = Inches(3.0)
        self._remove_table_borders(jurat_table)

        # Left: jurat text
        jurat_lines = [
            f"SWORN BEFORE ME at the",
            f"City of {city},",
            f"in the Province of {province},",
            f"this _____ day of __________, 20____",
            "",
            "",
        ]
        for i, line in enumerate(jurat_lines):
            cell = jurat_table.cell(i, 0)
            cell.text = ""
            p = cell.paragraphs[0]
            run = p.add_run(line)
            run.font.size = Pt(11)
            run.font.name = "Times New Roman"

        # Right: deponent signature
        cell = jurat_table.cell(2, 1)
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("_" * 30)
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        cell = jurat_table.cell(3, 1)
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(deponent_name.upper())
        run.bold = True
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        # Commissioner line at bottom left
        cell = jurat_table.cell(4, 0)
        cell.text = ""
        p = cell.paragraphs[0]
        run = p.add_run("_" * 30)
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        cell = jurat_table.cell(5, 0)
        cell.text = ""
        p = cell.paragraphs[0]
        run = p.add_run(f"A Commissioner for Taking Affidavits")
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        # Commissioner name
        p = doc.add_paragraph()
        p.space_before = Pt(6)
        run = p.add_run(f"Name: {commissioner_name}")
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        # Exhibit A cover page for affidavits
        self._create_exhibit_a_cover(doc, document_type, variables)

    def _create_exhibit_a_cover(
        self, doc: Document, document_type: str, variables: dict
    ) -> None:
        """Exhibit 'A' cover page for affidavits."""
        doc.add_page_break()

        deponent_name = (
            variables.get("deponentName")
            or variables.get("otherWitnessName")
            or variables.get("other_witness_name")
            or "[DEPONENT NAME]"
        )
        commissioner_name = (
            variables.get("commissionerName")
            or variables.get("commissioner_name")
            or "[COMMISSIONER NAME]"
        )

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.space_before = Pt(72)
        run = p.add_run('THIS IS EXHIBIT "A"')
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = "Times New Roman"

        doc.add_paragraph()

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(
            f"referred to in the Affidavit of {deponent_name.upper()}"
        )
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(f"sworn before me this _____ day of __________, 20____")
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        doc.add_paragraph()
        doc.add_paragraph()

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("_" * 35)
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("A Commissioner for Taking Affidavits")
        run.font.size = Pt(11)
        run.font.name = "Times New Roman"

    # ── Schedule A ──────────────────────────────────────────────────────────

    def _create_schedule_a(self, doc: Document, variables: dict) -> None:
        """
        Schedule 'A' for probate will: lists Excluded Property definition
        and cross-references the Non-Probate Will.
        """
        doc.add_page_break()

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.space_before = Pt(24)
        run = p.add_run('SCHEDULE "A"')
        run.bold = True
        run.font.size = Pt(14)
        run.font.name = "Times New Roman"

        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("EXCLUDED PROPERTY")
        run.bold = True
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        doc.add_paragraph()

        testator_name = (
            variables.get("testatorFullName")
            or variables.get("testator_full_name")
            or "[TESTATOR NAME]"
        )

        p = doc.add_paragraph()
        text = (
            f'"Excluded Property" means all property owned by '
            f"{testator_name.upper()} at the date of death that does not "
            f"require a Certificate of Appointment of Estate Trustee "
            f"(probate) for its transfer or realization, including but "
            f"not limited to:"
        )
        run = p.add_run(text)
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

        items = [
            "Property held in joint tenancy with right of survivorship;",
            "Property with designated beneficiaries (life insurance, RRSPs, RRIFs, TFSAs, pensions);",
            "Property held in trust;",
            "Personal effects and household contents;",
            "Any other property that can be transferred or realized without probate.",
        ]

        for item in items:
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.5)
            p.space_after = Pt(4)
            run = p.add_run(f"\u2022  {item}")
            run.font.size = Pt(12)
            run.font.name = "Times New Roman"

        doc.add_paragraph()

        p = doc.add_paragraph()
        text = (
            "The Excluded Property is dealt with under the Testator's "
            "Non-Probate Will of even date."
        )
        run = p.add_run(text)
        run.font.size = Pt(12)
        run.font.name = "Times New Roman"

    # ── Page Numbers ────────────────────────────────────────────────────────

    def _add_page_numbers(self, doc: Document) -> None:
        """Add 'Page X of Y' footer to all sections (right-aligned)."""
        for section in doc.sections:
            footer = section.footer
            footer.is_linked_to_previous = False
            p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT

            # Page number field
            run = p.add_run()
            fld_char_begin = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="begin"/>')
            run._r.append(fld_char_begin)

            run2 = p.add_run()
            instr = parse_xml(f'<w:instrText {nsdecls("w")} xml:space="preserve"> PAGE </w:instrText>')
            run2._r.append(instr)

            run3 = p.add_run()
            fld_char_sep = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="separate"/>')
            run3._r.append(fld_char_sep)

            run4 = p.add_run()
            fld_char_end = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="end"/>')
            run4._r.append(fld_char_end)

            run5 = p.add_run(" of ")
            run5.font.size = Pt(10)
            run5.font.name = "Times New Roman"

            # Total pages field
            run6 = p.add_run()
            fld2_begin = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="begin"/>')
            run6._r.append(fld2_begin)

            run7 = p.add_run()
            instr2 = parse_xml(f'<w:instrText {nsdecls("w")} xml:space="preserve"> NUMPAGES </w:instrText>')
            run7._r.append(instr2)

            run8 = p.add_run()
            fld2_sep = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="separate"/>')
            run8._r.append(fld2_sep)

            run9 = p.add_run()
            fld2_end = parse_xml(f'<w:fldChar {nsdecls("w")} w:fldCharType="end"/>')
            run9._r.append(fld2_end)

    # ── Document Styles ─────────────────────────────────────────────────────

    def _set_document_styles(self, doc: Document) -> None:
        """Set base document styles: font, margins, line spacing."""
        style = doc.styles["Normal"]
        style.font.name = "Times New Roman"
        style.font.size = Pt(12)
        style.paragraph_format.line_spacing = 1.5

        # Margins: 1 inch all around
        for section in doc.sections:
            section.top_margin = Inches(1)
            section.bottom_margin = Inches(1)
            section.left_margin = Inches(1)
            section.right_margin = Inches(1)

        # Heading styles
        for level in range(1, 4):
            style_name = f"Heading {level}"
            if style_name in doc.styles:
                h_style = doc.styles[style_name]
                h_style.font.name = "Times New Roman"
                h_style.font.size = Pt(14)
                h_style.font.bold = True

    # ── Table Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _remove_table_borders(table) -> None:
        """Remove all borders from a table for clean signing-page layout."""
        tbl = table._tbl
        tbl_pr = tbl.tblPr if tbl.tblPr is not None else parse_xml(
            f'<w:tblPr {nsdecls("w")}/>'
        )
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'  <w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'  <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'  <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'  <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'  <w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'  <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
            f'</w:tblBorders>'
        )
        tbl_pr.append(borders)

    # ── Batch Generation ────────────────────────────────────────────────────

    def generate_all_documents(
        self,
        draft_data: dict,
        clause_selections: dict[str, list[dict]],
        variables: dict,
    ) -> dict[str, bytes]:
        """
        Generate all required documents for a client.

        Args:
            draft_data: The full draft record from the database.
            clause_selections: Dict mapping document_type -> list of clause dicts.
            variables: Resolved placeholder variables.

        Returns:
            Dict mapping document_type -> DOCX file bytes.
        """
        results: dict[str, bytes] = {}

        for doc_type, clauses in clause_selections.items():
            if not clauses:
                continue
            try:
                docx_bytes = self.generate_document(
                    document_type=doc_type,
                    clauses=clauses,
                    variables=variables,
                )
                results[doc_type] = docx_bytes
                logger.info("Generated %s (%d bytes)", doc_type, len(docx_bytes))
            except Exception:
                logger.exception("Failed to generate %s", doc_type)

        return results
