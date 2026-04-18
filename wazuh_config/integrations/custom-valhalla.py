#!/usr/bin/env python3
"""
Valhalla SOC — Wazuh Integration Script
File: /var/ossec/integrations/custom-valhalla

This script is called by Wazuh Manager every time an alert is generated.
It forwards the alert to the Valhalla SOC Backend API.

Wazuh calls this script with:
  custom-valhalla <alert_file> <api_key> <hook_url> <alert_level>
  
The alert_file contains the full JSON alert from Wazuh.
"""

import sys
import json
import requests
import os
from datetime import datetime

# Read arguments from Wazuh
alert_file = sys.argv[1]
api_key = sys.argv[2] if len(sys.argv) > 2 else ""
hook_url = sys.argv[3] if len(sys.argv) > 3 else "http://backend:8000/api/webhook/wazuh"

# Log file for debugging
LOG_FILE = "/var/ossec/logs/integrations.log"


def log(message):
    """Write to integration log file."""
    try:
        with open(LOG_FILE, "a") as f:
            f.write(f"{datetime.now().isoformat()} | valhalla | {message}\n")
    except:
        pass


def main():
    try:
        # Read the alert JSON from the file Wazuh provides
        with open(alert_file, "r") as f:
            alert_data = json.load(f)
    except Exception as e:
        log(f"ERROR reading alert file: {e}")
        sys.exit(1)

    # The alert_data is already in Wazuh format — send it directly
    # Our backend expects this exact format
    try:
        response = requests.post(
            hook_url,
            json=alert_data,
            headers={
                "Content-Type": "application/json",
                "X-Wazuh-Integration": "valhalla-soc",
            },
            timeout=10,
        )

        if response.status_code == 200:
            result = response.json()
            log(f"OK | Alert #{result.get('id', '?')} | Severity: {result.get('severity', '?')}")
        else:
            log(f"ERROR | HTTP {response.status_code} | {response.text[:200]}")

    except requests.exceptions.ConnectionError:
        log(f"ERROR | Cannot connect to backend at {hook_url}")
    except Exception as e:
        log(f"ERROR | {str(e)[:200]}")

    sys.exit(0)


if __name__ == "__main__":
    main()
