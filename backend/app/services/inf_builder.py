"""Build Windows cursor scheme installation files."""

from __future__ import annotations

import re
from collections.abc import Mapping
from unicodedata import normalize

from app.models.cursor_item import CursorRole

REGISTRY_ROLE_ORDER = (
    ("Arrow", "pointer"),
    ("Help", "pointer"),
    ("AppStarting", "working"),
    ("Wait", "busy"),
    ("Crosshair", "precision"),
    ("IBeam", "text"),
    ("NWPen", "pointer"),
    ("No", "unavailable"),
    ("SizeNS", "move"),
    ("SizeWE", "move"),
    ("SizeNWSE", "move"),
    ("SizeNESW", "move"),
    ("SizeAll", "move"),
    ("UpArrow", "pointer"),
    ("Hand", "link"),
)

_FILENAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.(?:cur|ani)")
_WINDOWS_DEVICE_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{number}" for number in range(1, 10)),
    *(f"LPT{number}" for number in range(1, 10)),
}

INSTALL_README = (
    "Custom Cursor Studio & Library\r\n\r\n"
    "1. Extract the entire ZIP into a folder before installing.\r\n"
    "2. Right-click Install.inf and choose Install.\r\n"
    "   On Windows 11, you may need to choose Show more options first.\r\n"
    "   Windows may request administrator permission to copy the files.\r\n"
    "3. Open Mouse Properties > Pointers and select the CCS scheme.\r\n"
    "4. Click Apply to activate the scheme.\r\n\r\n"
    "To switch back, choose your previous scheme and click Apply.\r\n"
)


def build_install_inf(title: str, role_filenames: Mapping[str, str]) -> str:
    """Return an ASCII-safe, CRLF INF for the exact filenames in the pack."""
    if set(role_filenames) != {role.value for role in CursorRole}:
        raise ValueError("A cursor pack must contain exactly eight product roles")

    files = [role_filenames[role] for role in CursorRole]
    if any(
        _FILENAME.fullmatch(filename) is None
        or filename.split(".", 1)[0].upper() in _WINDOWS_DEVICE_NAMES
        for filename in files
    ):
        raise ValueError("Cursor filenames must be safe Windows basenames")
    if len({filename.lower() for filename in files}) != len(files):
        raise ValueError("Cursor filenames must be unique on Windows")

    ascii_title = normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    label = re.sub(r"[^A-Za-z0-9]+", " ", ascii_title).strip()[:64].rstrip()
    if not label:
        label = "Cursor Pack"
    directory = rf"Cursors\CCS-{label.replace(' ', '-')}"
    paths = ",".join(
        rf"%10%\%CUR_DIR%\{role_filenames[role]}" for _, role in REGISTRY_ROLE_ORDER
    )

    return "\r\n".join(
        (
            "[Version]",
            'Signature="$CHICAGO$"',
            "",
            "[DefaultInstall]",
            "CopyFiles=CursorFiles",
            "AddReg=CursorScheme",
            "",
            "[SourceDisksNames]",
            '1="%DISK_NAME%",,,',
            "",
            "[SourceDisksFiles]",
            *(f"{filename}=1" for filename in files),
            "",
            "[DestinationDirs]",
            'CursorFiles=10,"%CUR_DIR%"',
            "",
            "[CursorFiles]",
            *files,
            "",
            "[CursorScheme]",
            rf'HKCU,"Control Panel\Cursors\Schemes","%SCHEME_NAME%",0x00000000,"{paths}"',
            "",
            "[Strings]",
            'DISK_NAME="Custom Cursor Studio Assets"',
            f'CUR_DIR="{directory}"',
            f'SCHEME_NAME="CCS - {label}"',
            "",
        )
    )
