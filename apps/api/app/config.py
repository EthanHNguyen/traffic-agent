from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FlowOps API"
    database_url: str = "postgresql://traffic_agent:traffic_agent@localhost:5432/traffic_agent"
    cors_origins: str = "http://localhost:3000"
    vdot_username: str | None = None
    vdot_password: str | None = None
    openrouter_api_key: str | None = None
    vdot_services_base_url: str = "https://smarterroads.vdot.virginia.gov/services"
    vdot_gateway_base_url: str = "https://data.511-atis-ttrip-prod.iteriscloud.com"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def has_vdot_credentials(self) -> bool:
        return bool(self.vdot_username and self.vdot_password)


settings = Settings()
