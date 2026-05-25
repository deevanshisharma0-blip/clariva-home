from pydantic_settings import BaseSettings
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent

class Settings(BaseSettings):
    app_name: str = "NexusOS API"
    debug: bool = True
    database_url: str = f"sqlite+aiosqlite:///{ROOT}/data/nexus.db"
    anthropic_api_key: str = ""
    shopify_store: str = "lumera-aura.myshopify.com"
    shopify_token: str = ""  # CLI OAuth token (atkn_2.*) or Custom App token (shpat_*)
    shopify_api_key: str = ""
    shopify_api_secret: str = ""
    cj_api_email: str = ""
    cj_api_key: str = ""
    openrouter_api_key: str = ""
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "gemma4"  # gemma4 preferred; falls back to llama3.2:1b if not installed
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""

    # Slack — Incoming Webhooks (easier) OR Bot Token (more flexible)
    # Incoming webhooks: api.slack.com → Apps → NexusOS → Incoming Webhooks → Add to Slack
    slack_webhook_alerts: str = ""    # webhook URL for #nexusos-alerts
    slack_webhook_briefing: str = ""  # webhook URL for #nexusos-daily-briefing
    # Bot token (alternative): api.slack.com → Your Apps → OAuth & Permissions → Bot Token
    slack_bot_token: str = ""
    slack_channel_alerts: str = "C0B5U468282"
    slack_channel_briefing: str = "C0B5U466A10"

    # IONOS email (SMTP)
    ionos_smtp_host: str = "smtp.ionos.com"
    ionos_smtp_port: int = 587
    ionos_smtp_email: str = ""
    ionos_smtp_password: str = ""
    ionos_digest_recipient: str = ""   # email address to receive daily digests

    # IONOS DNS API
    ionos_api_prefix: str = ""         # from IONOS → Manage API keys
    ionos_api_secret: str = ""

    class Config:
        env_file = str(ROOT / ".env")
        extra = "ignore"

settings = Settings()
