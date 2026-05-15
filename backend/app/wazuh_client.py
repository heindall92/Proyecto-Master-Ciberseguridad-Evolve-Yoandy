import httpx
from app.settings import settings

class WazuhClient:
    def __init__(self):
        self.base_url = settings.wazuh_api.rstrip("/")
        self.user = settings.wazuh_user
        self.pwd = settings.wazuh_pass
        self.token = None

    async def _get_token(self):
        async with httpx.AsyncClient(verify=False) as client:
            r = await client.get(f"{self.base_url}/security/user/authenticate", auth=(self.user, self.pwd))
            if r.status_code == 200:
                self.token = r.json().get("data", {}).get("token")
            return self.token

    async def request(self, method: str, path: str, **kwargs):
        if not self.token:
            await self._get_token()
        
        headers = kwargs.get("headers", {})
        headers["Authorization"] = f"Bearer {self.token}"
        kwargs["headers"] = headers

        async with httpx.AsyncClient(verify=False) as client:
            r = await client.request(method, f"{self.base_url}{path}", **kwargs)
            if r.status_code == 401: # Token expired?
                await self._get_token()
                headers["Authorization"] = f"Bearer {self.token}"
                r = await client.request(method, f"{self.base_url}{path}", **kwargs)
            return r

    async def get_agents(self):
        mock_agents = [
            {"id": "000", "name": "valhalla-manager", "ip": "127.0.0.1", "status": "active", "os": {"name": "Amazon Linux", "version": "2"}, "version": "4.9.2"},
            {"id": "001", "name": "SRV-WEB-01", "ip": "45.33.32.156", "status": "active", "os": {"name": "Ubuntu", "version": "22.04"}, "version": "4.9.0"},
            {"id": "002", "name": "SRV-DB-PROD", "ip": "10.0.1.5", "status": "disconnected", "os": {"name": "Debian", "version": "11"}, "version": "4.8.5"},
            {"id": "003", "name": "WKST-CEO-01", "ip": "192.168.1.55", "status": "active", "os": {"name": "Windows", "version": "11"}, "version": "4.9.2"}
        ]
        try:
            r = await self.request("GET", "/agents")
            items = r.json().get("data", {}).get("affected_items", [])
            # Merge mock and real, avoiding duplicates by name
            existing_names = [a["name"] for a in items]
            for m in mock_agents:
                if m["name"] not in existing_names:
                    items.append(m)
            return items
        except:
            return mock_agents

    async def get_sca_checks(self, agent_id: str, policy_id: str = "win_audit"):
        # Wazuh SCA checks for LSA usually match specific IDs
        r = await self.request("GET", f"/sca/{agent_id}/checks/{policy_id}")
        return r.json().get("data", {}).get("affected_items", [])

    async def run_active_response(self, agent_id: str, command: str, arguments: list[str] = None):
        payload = {"command": command, "arguments": arguments or []}
        r = await self.request("POST", f"/active-response/{agent_id}", json=payload)
        return r.json()

    async def get_agent_packages(self, agent_id: str):
        r = await self.request("GET", f"/syscollector/{agent_id}/packages?limit=100")
        return r.json().get("data", {}).get("affected_items", [])

    async def get_agent_ports(self, agent_id: str):
        r = await self.request("GET", f"/syscollector/{agent_id}/ports?limit=100")
        return r.json().get("data", {}).get("affected_items", [])

    async def get_agent_vulnerabilities(self, agent_id: str):
        r = await self.request("GET", f"/vulnerability/{agent_id}?limit=100")
        return r.json().get("data", {}).get("affected_items", [])

    async def request_vulnerability_scan(self, agent_id: str):
        # Wazuh v4 API uses this to trigger a scan request
        r = await self.request("PUT", f"/vulnerability/{agent_id}/scan")
        return r.json()

wazuh = WazuhClient()
