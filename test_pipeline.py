import requests
import time
import json
import os
import sys

# Configuration
API_URL = "http://localhost:3000/api"
STEELOS_SPEC = {
  "base": "arch",
  "kernel": "linux-zen",
  "init": "systemd",
  "architecture": "x86_64",
  "display": {
     "server": "wayland",
     "compositor": "sway",
     "bar": "waybar",
     "launcher": "rofi-wayland",
     "terminal": "foot",
     "notifications": "mako",
     "lockscreen": "swaylock-effects"
  },
  "packages": {
    "system": ["btop"], 
    "dev": ["git"],
    "security": [],
    "utils": [],
    "media": [],
    "browsers": []
  },
  "securityFeatures": [
    "LUKS encryption", "Secure Boot", "AppArmor profiles",
    "UFW enabled", "Auto security updates"
  ],
  "defaults": {
    "swappiness": 10,
    "trim": True,
    "kernelParams": "mitigations=auto,nosmt",
    "dnsOverHttps": True,
    "macRandomization": True
  }
}
# Note: I reduced packages list to speed up the test (Arch install takes time), 
# but for "Full backend self-test" requested by user, I should probably use the full list 
# or at least enough to prove it works. 
# However, `pacman -Syu` and `mkarchiso` take a LOT of time and bandwidth. 
# Since this is a test of the *API and Pipeline logic*, checking if it *attempts* to build is key.
# But `mkarchiso` effectively builds a whole ISO.
# I will keep the list small for the "system" packages to make it faster, but enough to verify logic.
# Actually, `generateArchIso` does `mkarchiso`. This downloads packages. 
# I cannot change the fact that it downloads base system.
# I will restore the full list to be compliant with the user request "Test using the following distro specification".
# If it timeouts, I'll know.
STEELOS_SPEC["packages"]["system"] = ["firewalld", "apparmor", "firejail", "reflector", "btop", "zsh", "oh-my-zsh"]
STEELOS_SPEC["packages"]["dev"] = ["docker", "docker-compose", "podman", "git", "github-cli", "neovim", "tmux"]
STEELOS_SPEC["packages"]["security"] = ["wireguard-tools", "nmap", "wireshark-cli", "fail2ban", "ufw", "tor"]
STEELOS_SPEC["packages"]["utils"] = ["ranger", "rsync", "rclone", "trash-cli", "fzf"]
STEELOS_SPEC["packages"]["media"] = ["mpv", "imv", "alsa-utils", "pipewire", "wireplumber"]
STEELOS_SPEC["packages"]["browsers"] = ["firefox", "qutebrowser"]

def run_test():
    print("Starting SteelOS Build Test...")
    
    # Wait for server to be ready
    print("Waiting for server...")
    for _ in range(10):
        try:
            requests.get("http://localhost:3000/api/health")
            print("Server is ready.")
            break
        except:
            time.sleep(1)
    else:
        print("Server did not start in time.")
        sys.exit(1)

    # 1. Start Build
    try:
        print(f"Sending POST to {API_URL}/build/start")
        resp = requests.post(f"{API_URL}/build/start", json=STEELOS_SPEC)
        if resp.status_code != 202:
            print(f"Error: {resp.status_code} - {resp.text}")
        resp.raise_for_status()
        data = resp.json()
        build_id = data.get("buildId")
        print(f"Build started with ID: {build_id}")
    except Exception as e:
        print(f"Failed to start build: {e}")
        sys.exit(1)

    # 2. Poll Status
    print("Polling for status...")
    status = "PENDING"
    start_time = time.time()
    # Increase timeout because ISO build takes time
    while status in ["PENDING", "IN_PROGRESS"]:
        if time.time() - start_time > 600: # 10 minutes timeout
            print("Timeout waiting for build.")
            break
            
        time.sleep(5)
        try:
            resp = requests.get(f"{API_URL}/build/status/{build_id}")
            resp.raise_for_status()
            build_data = resp.json()
            status = build_data.get("status")
            print(f"Status: {status}")
            
            # Print last few logs
            logs = build_data.get("logs", [])
            if logs:
                # Print new logs only? simplified for now
                print(f"Last log: {logs[-1]['message']}")
                
        except Exception as e:
            print(f"Error polling status: {e}")

    # 3. Verify Result
    if status == "SUCCESS":
        print("Build SUCCESS!")
        artifacts = build_data.get("artifacts", [])
        print("Artifacts:")
        for a in artifacts:
            print(f" - {a['fileType']}: {a['fileName']} ({a['url']})")
        
        # Verify ISO and Docker Image are present
        has_iso = any(a['fileType'] == 'iso' for a in artifacts)
        has_docker = any(a['fileType'] in ['docker-image', 'docker-image-ref'] for a in artifacts)
        
        if has_iso and has_docker:
            print("VERIFICATION PASSED: Both ISO and Docker artifacts present.")
        else:
            print(f"VERIFICATION FAILED: Missing artifacts. ISO: {has_iso}, Docker: {has_docker}")
            sys.exit(1)
    else:
        print(f"Build FAILED with status: {status}")
        # Dump logs
        print("Logs:")
        for log in build_data.get("logs", []):
            print(f"[{log['createdAt']}] {log['message']}")
        sys.exit(1)

if __name__ == "__main__":
    run_test()
