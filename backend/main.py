from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from services.db import init_pool, close_pool
from routes.drafts import router as drafts_router
from routes.links import router as links_router
from routes.agents import router as agents_router
from routes.clauses import router as clauses_router
from routes.documents import router as documents_router
from routes.review import router as review_router

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    yield
    close_pool()

app = FastAPI(
    title="EZWill API",
    description="Ontario Will Builder — EZWill backend service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", os.getenv("FRONTEND_URL", "")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(drafts_router, prefix="/api/drafts", tags=["drafts"])
app.include_router(links_router, prefix="/api/links", tags=["links"])
app.include_router(agents_router, prefix="/agents", tags=["agents"])
app.include_router(clauses_router, prefix="/api/drafts", tags=["clauses"])
app.include_router(documents_router, prefix="/api/documents", tags=["documents"])
app.include_router(review_router, prefix="/api/review", tags=["review"])

@app.get("/")
async def health():
    return {"status": "ok", "service": "ezwill", "version": "1.0.0"}

@app.get("/ready")
async def ready():
    from services.db import get_pool
    pool = get_pool()
    conn = pool.getconn()
    pool.putconn(conn)
    return {"status": "ready"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("EZWILL_PORT", "8003"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
