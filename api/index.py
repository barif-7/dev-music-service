from mangum import Mangum
from main import app

# Vercel serverless handler using Mangum (ASGI adapter)
handler = Mangum(app, lifespan="off")
