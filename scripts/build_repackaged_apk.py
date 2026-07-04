import base64
import hashlib
import os
import struct
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / ".vendor" / "py"
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
from cryptography.x509.oid import NameOID


BASE_APK = ROOT / "digital-ops-quiz.apk.1(2).1"
WEB_DIR = ROOT / "web"
DIST_DIR = ROOT / "dist"
KEY_DIR = ROOT / "keystore"
KEY_FILE = KEY_DIR / "fund-assistant-debug-key.pem"
CERT_FILE = KEY_DIR / "fund-assistant-debug-cert.pem"
OUT_APK = DIST_DIR / "FundAssistant-0.1.1-compat.apk"
OLD_LABEL = "数字化运维刷题"
NEW_LABEL = "基金助手"


def digest(data):
    return base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")


def wrap_line(line):
    raw = line.encode("utf-8")
    if len(raw) <= 70:
        return line
    parts = []
    current = raw[:70]
    raw = raw[70:]
    parts.append(current.decode("utf-8", errors="ignore"))
    while raw:
        current = raw[:69]
        raw = raw[69:]
        parts.append(" " + current.decode("utf-8", errors="ignore"))
    return "\r\n".join(parts)


def manifest_section(name, data):
    text = f"Name: {name}\r\nSHA-256-Digest: {digest(data)}\r\n\r\n"
    return "\r\n".join(wrap_line(line) for line in text.split("\r\n"))


def load_or_create_key():
    KEY_DIR.mkdir(parents=True, exist_ok=True)
    if KEY_FILE.exists() and CERT_FILE.exists():
        key = serialization.load_pem_private_key(KEY_FILE.read_bytes(), password=None)
        cert = x509.load_pem_x509_certificate(CERT_FILE.read_bytes())
        return key, cert

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "CN"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Fund Assistant"),
        x509.NameAttribute(NameOID.COMMON_NAME, "Fund Assistant Debug"),
    ])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=3650))
        .sign(key, hashes.SHA256())
    )
    KEY_FILE.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    CERT_FILE.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return key, cert


def collect_entries():
    entries = []
    with zipfile.ZipFile(BASE_APK, "r") as base:
        for info in base.infolist():
            if info.filename.startswith("META-INF/") or info.filename.startswith("assets/"):
                continue
            data = base.read(info.filename)
            if info.filename == "AndroidManifest.xml":
                data = patch_manifest_label(data)
            entries.append((info.filename, data, info.compress_type))

    for path in sorted(WEB_DIR.iterdir()):
        if path.is_file():
            name = "assets/" + path.name
            compress = zipfile.ZIP_STORED if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".svg"} else zipfile.ZIP_DEFLATED
            entries.append((name, path.read_bytes(), compress))
    return entries


def patch_manifest_label(data):
    old = OLD_LABEL.encode("utf-16le")
    new = NEW_LABEL.encode("utf-16le")
    offset = data.find(old)
    if offset < 2 or len(new) > len(old):
        return data

    patched = bytearray(data)
    # Android binary XML string pools store short UTF-16 strings as:
    # u16 length, u16 characters, u16 null terminator. Keep the original
    # allocation size so downstream string offsets remain valid.
    patched[offset - 2:offset] = len(NEW_LABEL).to_bytes(2, "little")
    patched[offset:offset + len(old)] = new + (b"\x00" * (len(old) - len(new)))
    return bytes(patched)


def read_manifest_strings(data):
    pool_offset = 8
    _, header_size, _ = struct.unpack_from("<HHI", data, pool_offset)
    string_count, _, _, strings_start, _ = struct.unpack_from("<IIIII", data, pool_offset + 8)
    offsets = [
        struct.unpack_from("<I", data, pool_offset + header_size + index * 4)[0]
        for index in range(string_count)
    ]
    strings = []
    string_positions = []
    for rel in offsets:
        pos = pool_offset + strings_start + rel
        length = struct.unpack_from("<H", data, pos)[0]
        value_pos = pos + 2
        value = data[value_pos:value_pos + length * 2].decode("utf-16le", errors="ignore")
        strings.append(value)
        string_positions.append((pos, value_pos, length))
    return strings, string_positions


def patch_manifest_sdk(data):
    patched = bytearray(data)
    strings, positions = read_manifest_strings(data)

    for value, replacement in [("15", "16")]:
        if value in strings:
            _, value_pos, length = positions[strings.index(value)]
            if len(replacement) == length:
                patched[value_pos:value_pos + length * 2] = replacement.encode("utf-16le")

    pos = 8
    while pos + 8 <= len(patched):
        chunk_type, _, chunk_size = struct.unpack_from("<HHI", patched, pos)
        if chunk_type == 0x0102:
            attr_start, attr_size, attr_count = struct.unpack_from("<HHH", patched, pos + 24)
            base = pos + 16 + attr_start
            for index in range(attr_count):
                attr_offset = base + index * attr_size
                _, name_index, _ = struct.unpack_from("<III", patched, attr_offset)
                if name_index < len(strings) and strings[name_index] in {
                    "compileSdkVersion",
                    "platformBuildVersionCode",
                    "targetSdkVersion",
                }:
                    patched[attr_offset + 16:attr_offset + 20] = (36).to_bytes(4, "little")
                if name_index < len(strings) and strings[name_index] == "platformBuildVersionName":
                    patched[attr_offset + 16:attr_offset + 20] = (16).to_bytes(4, "little")
        if chunk_size <= 0:
            break
        pos += chunk_size

    return bytes(patched)


def build_manifest(entries):
    header = "Manifest-Version: 1.0\r\nCreated-By: FundAssistant\r\n\r\n"
    sections = []
    section_map = {}
    for name, data, _ in entries:
        section = manifest_section(name, data)
        sections.append(section)
        section_map[name] = section.encode("utf-8")
    manifest = header.encode("utf-8") + b"".join(section.encode("utf-8") for section in sections)
    return manifest, section_map


def build_sf(manifest, section_map):
    header = (
        "Signature-Version: 1.0\r\n"
        "Created-By: FundAssistant\r\n"
        f"SHA-256-Digest-Manifest: {digest(manifest)}\r\n\r\n"
    )
    body = []
    for name, section_bytes in section_map.items():
        body.append(f"Name: {name}\r\nSHA-256-Digest: {digest(section_bytes)}\r\n\r\n")
    return (header + "".join(body)).encode("utf-8")


def sign_sf(sf_bytes, key, cert):
    return (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(sf_bytes)
        .add_signer(cert, key, hashes.SHA256())
        .sign(
            serialization.Encoding.DER,
            [pkcs7.PKCS7Options.Binary, pkcs7.PKCS7Options.DetachedSignature],
        )
    )


def write_apk(entries, manifest, sf, rsa_bytes):
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_APK.exists():
        OUT_APK.unlink()
    with zipfile.ZipFile(OUT_APK, "w") as out:
        for name, data, compress in entries:
            info = zipfile.ZipInfo(name)
            info.compress_type = compress
            info.date_time = (2026, 7, 2, 12, 0, 0)
            info.external_attr = 0o644 << 16
            out.writestr(info, data)

        for name, data in [
            ("META-INF/MANIFEST.MF", manifest),
            ("META-INF/CERT.SF", sf),
            ("META-INF/CERT.RSA", rsa_bytes),
        ]:
            info = zipfile.ZipInfo(name)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.date_time = (2026, 7, 2, 12, 0, 0)
            info.external_attr = 0o644 << 16
            out.writestr(info, data)


def main():
    if not BASE_APK.exists():
        raise SystemExit(f"missing base apk: {BASE_APK}")
    if not WEB_DIR.exists():
        raise SystemExit(f"missing web assets: {WEB_DIR}")

    entries = collect_entries()
    manifest, section_map = build_manifest(entries)
    sf = build_sf(manifest, section_map)
    key, cert = load_or_create_key()
    rsa_bytes = sign_sf(sf, key, cert)
    write_apk(entries, manifest, sf, rsa_bytes)

    print(f"built {OUT_APK}")
    print(f"size {OUT_APK.stat().st_size} bytes")
    print("launcher label patched to 基金助手")
    print("compat build keeps the original shell SDK metadata for broader install compatibility")


if __name__ == "__main__":
    main()
