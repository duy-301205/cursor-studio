"""Golden and adversarial checks for the Windows INF builder."""

from __future__ import annotations

import pytest

from app.services.inf_builder import (
    INSTALL_README,
    REGISTRY_ROLE_ORDER,
    build_install_inf,
)

_FILES = {
    "pointer": "pointer.cur",
    "link": "link.cur",
    "text": "text.cur",
    "busy": "busy.ani",
    "working": "working.ani",
    "precision": "precision.cur",
    "unavailable": "unavailable.cur",
    "move": "move.cur",
}
_GOLDEN = r"""
[Version]
Signature="$CHICAGO$"

[DefaultInstall]
CopyFiles=CursorFiles
AddReg=CursorScheme

[SourceDisksNames]
1="%DISK_NAME%",,,

[SourceDisksFiles]
pointer.cur=1
link.cur=1
text.cur=1
busy.ani=1
working.ani=1
precision.cur=1
unavailable.cur=1
move.cur=1

[DestinationDirs]
CursorFiles=10,"%CUR_DIR%"

[CursorFiles]
pointer.cur
link.cur
text.cur
busy.ani
working.ani
precision.cur
unavailable.cur
move.cur

[CursorScheme]
HKCU,"Control Panel\Cursors\Schemes","%SCHEME_NAME%",0x00000000,"%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\working.ani,%10%\%CUR_DIR%\busy.ani,%10%\%CUR_DIR%\precision.cur,%10%\%CUR_DIR%\text.cur,%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\unavailable.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\move.cur,%10%\%CUR_DIR%\pointer.cur,%10%\%CUR_DIR%\link.cur,%10%\%CUR_DIR%\link.cur,%10%\%CUR_DIR%\link.cur"

[Strings]
DISK_NAME="Custom Cursor Studio Assets"
CUR_DIR="Cursors\CCS-Crystal-White"
SCHEME_NAME="CCS - Crystal White"
""".lstrip("\n").replace("\n", "\r\n")


def test_inf_golden() -> None:
    result = build_install_inf("Crystal White", dict(reversed(tuple(_FILES.items()))))
    assert result == _GOLDEN
    assert result.isascii()
    assert "\n" not in result.replace("\r\n", "")


def test_scheme_slot_order_and_source_files() -> None:
    expected_slots = (
        "Arrow",
        "Help",
        "AppStarting",
        "Wait",
        "Crosshair",
        "IBeam",
        "NWPen",
        "No",
        "SizeNS",
        "SizeWE",
        "SizeNWSE",
        "SizeNESW",
        "SizeAll",
        "UpArrow",
        "Hand",
        "Pin",
        "Person",
    )
    assert len(REGISTRY_ROLE_ORDER) == 17
    assert tuple(slot for slot, _ in REGISTRY_ROLE_ORDER) == expected_slots
    inf = build_install_inf("Example", _FILES)
    scheme = inf.split("[CursorScheme]\r\n", 1)[1].splitlines()[0]
    _, registry_value = scheme.split(",0x00000000,", 1)
    paths = registry_value.strip('"').split(",")
    assert len(paths) == 17
    assert paths[2].endswith(r"\working.ani")
    assert paths[3].endswith(r"\busy.ani")
    expected = [
        "pointer.cur",
        "pointer.cur",
        "working.ani",
        "busy.ani",
        "precision.cur",
        "text.cur",
        "pointer.cur",
        "unavailable.cur",
        "move.cur",
        "move.cur",
        "move.cur",
        "move.cur",
        "move.cur",
        "pointer.cur",
        "link.cur",
        "link.cur",
        "link.cur",
    ]
    assert paths == [rf"%10%\%CUR_DIR%\{filename}" for filename in expected]
    sources = inf.split("[SourceDisksFiles]\r\n", 1)[1].split("\r\n\r\n", 1)[0]
    copies = inf.split("[CursorFiles]\r\n", 1)[1].split("\r\n\r\n", 1)[0]
    assert {entry.removesuffix("=1") for entry in sources.splitlines()} == set(expected)
    assert set(copies.splitlines()) == set(expected)


def test_title_cannot_inject_inf_syntax() -> None:
    inf = build_install_inf('Café",%10%\r\n[Injected]\r\nHKLM=1', _FILES)
    assert [line for line in inf.splitlines() if line.startswith("[")] == [
        "[Version]",
        "[DefaultInstall]",
        "[SourceDisksNames]",
        "[SourceDisksFiles]",
        "[DestinationDirs]",
        "[CursorFiles]",
        "[CursorScheme]",
        "[Strings]",
    ]
    assert 'SCHEME_NAME="CCS - Cafe 10 Injected HKLM 1"' in inf
    assert 'CUR_DIR="Cursors\\CCS-Cafe-10-Injected-HKLM-1"' in inf
    assert "HKLM=1" not in inf
    assert build_install_inf('%,"\r\n', _FILES).endswith(
        'SCHEME_NAME="CCS - Cursor Pack"\r\n'
    )


def test_all_seventeen_slots_accept_distinct_files() -> None:
    filenames = {
        **_FILES,
        "help": "help.cur",
        "handwriting": "handwriting.cur",
        "resize_vertical": "vertical.cur",
        "resize_horizontal": "horizontal.cur",
        "resize_diagonal_nwse": "nwse.cur",
        "resize_diagonal_nesw": "nesw.cur",
        "alternate": "alternate.cur",
        "location": "location.ani",
        "person": "person.cur",
    }
    inf = build_install_inf("Example", filenames)
    scheme = inf.split("[CursorScheme]\r\n", 1)[1].splitlines()[0]
    paths = scheme.rsplit(',"', 1)[1].removesuffix('"').split(",")
    assert [path.rsplit("\\", 1)[1] for path in paths] == [
        "pointer.cur",
        "help.cur",
        "working.ani",
        "busy.ani",
        "precision.cur",
        "text.cur",
        "handwriting.cur",
        "unavailable.cur",
        "vertical.cur",
        "horizontal.cur",
        "nwse.cur",
        "nesw.cur",
        "move.cur",
        "alternate.cur",
        "link.cur",
        "location.ani",
        "person.cur",
    ]


@pytest.mark.parametrize(
    "filename",
    [
        "../outside.cur",
        r"..\outside.cur",
        "/file.cur",
        "C:file.cur",
        "file.exe",
        "a.cur.ani",
        "a,1.cur",
        "a\r\n[Bad].cur",
        "%10%.cur",
        "nul.cur",
        "COM1.ani",
        "café.cur",
        'a".cur',
        "a;comment.cur",
    ],
)
def test_reject_unsafe_filenames(filename: str) -> None:
    with pytest.raises(ValueError, match="safe Windows basenames"):
        build_install_inf("Test", {**_FILES, "pointer": filename})


def test_requires_all_eight_unique_role_files() -> None:
    with pytest.raises(ValueError, match="eight base roles"):
        build_install_inf(
            "Test",
            {role: filename for role, filename in _FILES.items() if role != "pointer"},
        )
    with pytest.raises(ValueError, match="eight base roles"):
        build_install_inf("Test", {**_FILES, "pin": "pin.cur"})
    with pytest.raises(ValueError, match="unique on Windows"):
        build_install_inf("Test", {**_FILES, "pointer": "LINK.cur"})


def test_readme_explains_explicit_windows_activation() -> None:
    assert INSTALL_README.isascii()
    assert "Extract the entire ZIP" in INSTALL_README
    assert "Right-click Install.inf and choose Install" in INSTALL_README
    assert "Mouse Properties > Pointers" in INSTALL_README
    assert "Click Apply to activate" in INSTALL_README
