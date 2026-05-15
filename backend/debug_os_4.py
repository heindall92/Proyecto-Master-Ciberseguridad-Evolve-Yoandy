import asyncio
import httpx
import json

async def debug():
    url = "https://wazuh.indexer:9200"
    auth = ("admin", "admin")
    async with httpx.AsyncClient(auth=auth, verify=False) as client:
        query = {
            "query": {"match": {"rule.groups": "cowrie"}},
            "sort": [{"@timestamp": "desc"}],
            "size": 1
        }
        res = await client.post(f"{url}/wazuh-alerts-*/_search", json=query)
        hits = res.json().get("hits", {}).get("hits", [])
        if hits:
            print("Latest Cowrie @timestamp:", hits[0]["_source"]["@timestamp"])
        else:
            print("No Cowrie hits found.")

asyncio.run(debug())
