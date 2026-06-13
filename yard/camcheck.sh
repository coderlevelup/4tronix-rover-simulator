#!/bin/bash
# camcheck.sh — rover camera connection diagnostic.
# Run ON the rover (ssh mars@<rover>.local then ./camcheck.sh).
# Tests the two independent layers (I2C detect vs CSI data) and prints a
# plain-English verdict. See yard/MANUAL.md "Diagnosing the camera".

echo "── Rover camera diagnostic ──────────────────────────"
echo "uptime      : $(uptime -p)   (camera is probed once, at boot)"

# Layer 1 — sensor detected on the I2C control bus?
DET=$(rpicam-hello --list-cameras 2>/dev/null | grep -oE 'imx[0-9]+' | head -1)
echo -n "1 detect    : "; [ -n "$DET" ] && echo "$DET" || echo "NONE"

# Layer 2 — can it actually stream pixels over the CSI data lanes?
rm -f /tmp/camcheck.jpg
if timeout 30 rpicam-still -n --immediate --width 640 --height 480 \
     -o /tmp/camcheck.jpg >/dev/null 2>&1 && [ -s /tmp/camcheck.jpg ]; then
    CAP="OK ($(stat -c%s /tmp/camcheck.jpg) bytes)"
else
    CAP="FAIL"
fi
echo "2 capture   : $CAP"
echo "throttled   : $(vcgencmd get_throttled)   (!=0x0 => power problem)"

echo "─────────────────────────────────────────────────────"
if [ -n "$DET" ] && [[ "$CAP" == OK* ]]; then
    echo "VERDICT: WORKING."
elif [ -z "$DET" ]; then
    echo "VERDICT: sensor NOT detected. Cable not making contact (I2C dead)."
    echo "  Reboot needed after any fix — detection only happens at boot."
    echo "  Reseat BOTH ends square+firm; check the mast isn't straining the"
    echo "  ribbon; try a known-good cable. (Old Bullseye + v3 also needs"
    echo "  dtoverlay=imx708 forced — but Bookworm auto-detects.)"
else
    echo "VERDICT: detected but NO DATA. Control wires OK, CSI data lanes dead."
    echo "  Physical: cracked/half-seated ribbon or damaged connector. Reseat"
    echo "  or swap the cable. NOT a software problem."
fi
