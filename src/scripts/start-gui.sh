#!/bin/bash
Xvfb :1 -screen 0 1280x720x24 &
export DISPLAY=:1
startxfce4 &
tigervncserver :1 -localhost no &
websockify --web /usr/share/novnc 6080 localhost:5901
