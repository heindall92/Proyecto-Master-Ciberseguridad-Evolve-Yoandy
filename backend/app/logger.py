import logging
import sys
import structlog
from app.settings import settings

def _drop_sensitive_keys(_, __, event_dict):
    """Filter out passwords, tokens, and PII from logs"""
    sensitive_keys = {"password", "token", "access_token", "secret", "authorization"}
    for key in list(event_dict.keys()):
        if any(s in key.lower() for s in sensitive_keys):
            event_dict[key] = "[REDACTED]"
    return event_dict

def setup_logging():
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            _drop_sensitive_keys,
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer()
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Configure standard logging to use structlog
    formatter = structlog.stdlib.ProcessorFormatter(
        processor=structlog.processors.JSONRenderer(),
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    
    # Set log level based on environment
    log_level = logging.INFO if settings.env == "production" else logging.DEBUG
    root_logger.setLevel(log_level)
    
    # Silence uvicorn access logs if needed (they can be chatty)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

setup_logging()
logger = structlog.get_logger("valhalla")
