"""
PDF Converter -- converts DOCX to PDF.
Uses LibreOffice in headless mode if available, otherwise returns None.
"""

import os
import shutil
import subprocess
import tempfile
import logging

logger = logging.getLogger(__name__)

# Cache the LibreOffice binary path on first use
_libreoffice_bin: str | None = None
_libreoffice_checked: bool = False


def _find_libreoffice() -> str | None:
    """Locate the LibreOffice binary. Checks common paths on macOS and Linux."""
    global _libreoffice_bin, _libreoffice_checked

    if _libreoffice_checked:
        return _libreoffice_bin

    _libreoffice_checked = True

    # Check environment override
    env_path = os.getenv("LIBREOFFICE_BIN")
    if env_path and os.path.isfile(env_path):
        _libreoffice_bin = env_path
        return _libreoffice_bin

    # Check PATH
    for name in ("libreoffice", "soffice"):
        path = shutil.which(name)
        if path:
            _libreoffice_bin = path
            return _libreoffice_bin

    # macOS common locations
    mac_paths = [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        os.path.expanduser("~/Applications/LibreOffice.app/Contents/MacOS/soffice"),
    ]
    for p in mac_paths:
        if os.path.isfile(p):
            _libreoffice_bin = p
            return _libreoffice_bin

    logger.warning("LibreOffice not found -- PDF conversion unavailable")
    _libreoffice_bin = None
    return None


def convert_to_pdf(docx_bytes: bytes) -> bytes | None:
    """
    Convert a DOCX file (as bytes) to PDF using LibreOffice headless mode.

    Args:
        docx_bytes: The DOCX file content as bytes.

    Returns:
        The PDF file content as bytes, or None if LibreOffice is not available
        or conversion fails.
    """
    lo_bin = _find_libreoffice()
    if not lo_bin:
        return None

    tmp_dir = None
    try:
        tmp_dir = tempfile.mkdtemp(prefix="ezwill_pdf_")
        docx_path = os.path.join(tmp_dir, "document.docx")
        pdf_path = os.path.join(tmp_dir, "document.pdf")

        with open(docx_path, "wb") as f:
            f.write(docx_bytes)

        result = subprocess.run(
            [
                lo_bin,
                "--headless",
                "--convert-to", "pdf",
                "--outdir", tmp_dir,
                docx_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0:
            logger.error(
                "LibreOffice conversion failed (rc=%d): %s",
                result.returncode,
                result.stderr,
            )
            return None

        if not os.path.isfile(pdf_path):
            logger.error("PDF output file not found after conversion")
            return None

        with open(pdf_path, "rb") as f:
            return f.read()

    except subprocess.TimeoutExpired:
        logger.error("LibreOffice conversion timed out (60s)")
        return None
    except Exception:
        logger.exception("PDF conversion failed")
        return None
    finally:
        if tmp_dir:
            try:
                shutil.rmtree(tmp_dir)
            except OSError:
                pass
