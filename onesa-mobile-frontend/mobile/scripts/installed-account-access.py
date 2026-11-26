"""Operate the installed qualification APK via Android's accessibility tree."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = os.environ["APP_ID"]


def adb(*args):
    return subprocess.check_output(["adb", *args], text=True, timeout=20)


def locate(label):
    adb("shell", "uiautomator", "dump", "/sdcard/onesa-qualification.xml")
    tree = ET.fromstring(adb("shell", "cat", "/sdcard/onesa-qualification.xml").strip())
    for node in tree.iter("node"):
        if label not in (node.get("text"), node.get("content-desc")):
            continue
        values = [int(x) for x in re.findall(r"\d+", node.get("bounds", ""))]
        if len(values) == 4 and values[2] > values[0] and values[3] > values[1]:
            return (values[0] + values[2]) // 2, (values[1] + values[3]) // 2
    return None


def visible(label, allow_scroll=False):
    end = time.monotonic() + 55
    while time.monotonic() < end:
        point = locate(label)
        if point is not None:
            return point
        if allow_scroll:
            adb("shell", "input", "swipe", "480", "1180", "480", "440", "360")
        time.sleep(1)
    raise RuntimeError("The installed app never displayed " + label)


def tap(label, allow_scroll=False):
    x, y = visible(label, allow_scroll)
    adb("shell", "input", "tap", str(x), str(y))


if __name__ == "__main__":
    try:
        visible("Your mobile account")
        print("Installed application opened the account screen", flush=True)
        tap("Explore without signing in", allow_scroll=True)
        visible("Return to account access")
        print("Installed application opened the guest preview", flush=True)
        tap("Return to account access")
        visible("Your mobile account")
        print("Installed application restored the account screen", flush=True)
        # A Mobile outage must never redirect a customer to Portal staff sign-in.
        try:
            visible("Sign in to Company Portal", allow_scroll=True)
        except RuntimeError:
            print("No Company Portal sign-in fallback", flush=True)
        else:
            raise RuntimeError("Mobile unexpectedly offered Company Portal sign-in")
    finally:
        adb("shell", "rm", "-f", "/sdcard/onesa-qualification.xml")
