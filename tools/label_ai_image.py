"""Mark WebP photos as AI-made, as Google Merchant Center asks (IPTC DigitalSourceType trainedAlgorithmicMedia in XMP).
Usage: python3 tools/label_ai_image.py assets/a.webp [assets/b.webp ...]
The image data is not re-encoded; a file that already has XMP is left alone."""
import struct
import sys
from pathlib import Path

AI_SOURCE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
XMP = ('<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
       '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
       '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" '
       'Iptc4xmpExt:DigitalSourceType="%s"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>' % AI_SOURCE).encode("utf-8")


def chunks(data):
    index = 12
    while index + 8 <= len(data):
        kind, size = data[index:index + 4], struct.unpack("<I", data[index + 4:index + 8])[0]
        yield kind, data[index:index + 8 + size + (size & 1)]
        index += 8 + size + (size & 1)


def chunk(kind, body):
    return kind + struct.pack("<I", len(body)) + body + (b"\0" if len(body) & 1 else b"")


def label(path):
    data = Path(path).read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise SystemExit("%s is not a WebP file" % path)
    parts = list(chunks(data))
    kinds = [kind for kind, _ in parts]
    if b"XMP " in kinds:
        return False
    if kinds != [b"VP8 "]:
        raise SystemExit("%s: only simple lossy WebP files are handled (found %s)" % (path, kinds))
    frame = parts[0][1][8:]
    if frame[3:6] != b"\x9d\x01\x2a":
        raise SystemExit("%s: VP8 frame header not found" % path)
    width = struct.unpack("<H", frame[6:8])[0] & 0x3FFF
    height = struct.unpack("<H", frame[8:10])[0] & 0x3FFF
    vp8x = bytes([0x04, 0, 0, 0]) + (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little")
    body = b"WEBP" + chunk(b"VP8X", vp8x) + parts[0][1] + chunk(b"XMP ", XMP)
    Path(path).write_bytes(b"RIFF" + struct.pack("<I", len(body)) + body)
    return True


if __name__ == "__main__":
    for name in sys.argv[1:]:
        print(("labelled " if label(name) else "already has XMP ") + name)
