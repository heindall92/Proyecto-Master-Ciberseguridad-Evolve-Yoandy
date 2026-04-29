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

wazuh = WazuhClient()
