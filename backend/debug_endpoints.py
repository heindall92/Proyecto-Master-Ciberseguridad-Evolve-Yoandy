import asyncio
from app.opensearch_client import get_recent_alerts, get_honeypot_stats, get_threat_map
from app.settings import settings
import json

async def debug():
    print(f"VT API KEY: {settings.virustotal_api_key}")
    
    recent = await get_recent_alerts(10, 24)
    print(f"RECENT ALERTS: {len(recent)}")
    if recent:
        print(f"SAMPLE ALERT: {json.dumps(recent[0], indent=2)}")
        
    hp = await get_honeypot_stats(24)
    print(f"HONEYPOT STATS: {json.dumps(hp, indent=2)}")
    
    map_data = await get_threat_map(24)
    print(f"THREAT MAP ATTACKS: {len(map_data['attacks'])}")

if __name__ == "__main__":
    asyncio.run(debug())
