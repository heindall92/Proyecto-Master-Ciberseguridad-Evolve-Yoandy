
import asyncio
import os
import sys

# Add the project root to sys.path so we can import 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.settings import settings
from app import opensearch_client as osc

async def check():
    print(f"Checking Cowrie events in OpenSearch: {settings.opensearch_url}")
    try:
        stats = await osc.get_cowrie_stats(hours=24)
        print(f"Cowrie Stats (24h): {stats}")
        
        sessions = await osc.get_cowrie_sessions(limit=5, hours=24)
        print(f"Recent Sessions: {len(sessions)}")
        for s in sessions:
            print(f" - {s['timestamp']} | {s['ip']} | {s['command']}")
            
        if stats.get('total', 0) > 0:
            print("\n[SUCCESS] Cowrie data is flowing into OpenSearch.")
            return True
        else:
            print("\n[WARNING] No Cowrie events found in the last 24h.")
            return False
            
    except Exception as e:
        print(f"\n[ERROR] Failed to check Cowrie: {e}")
        return False

if __name__ == "__main__":
    asyncio.run(check())
