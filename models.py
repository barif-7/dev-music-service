from pydantic import BaseModel

class SongSearchResult(BaseModel):
    title: str
    url: str # URL to invoke streaming response from the server.
    duration: int # seconds