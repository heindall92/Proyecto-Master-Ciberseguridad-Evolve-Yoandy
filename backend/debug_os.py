import asyncio
import httpx
import json

async def debug():
    url = "https://wazuh.indexer:9200"
    auth = ("admin", "admin")
    async with httpx.AsyncClient(auth=auth, verify=False) as client:
        # 1. Get indices
        res = await client.get(f"{url}/_cat/indices?v")
        print("INDICES:\n", res.text)
        
        # 2. Get mapping for the latest index
        res = await client.get(f"{url}/wazuh-alerts-*/_mapping")
        mapping = res.json()
        print("MAPPING (partial):\n", json.dumps(list(mapping.values())[0]["mappings"]["properties"].get("data", {}).get("properties", {}).get("srcip", {}), indent=2))
        
        # 3. Test Honeypot query
        query = {
            "query": {"match": {"rule.groups": "cowrie"}}
        }
        res = await client.post(f"{url}/wazuh-alerts-*/_search", json=query)
        print("COWRIE HITS:", res.json().get("hits", {}).get("total", {}).get("value", 0))

asyncio.run(debug())
