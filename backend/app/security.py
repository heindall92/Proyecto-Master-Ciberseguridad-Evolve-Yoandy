"""
Comprehensive Security Module for Valhalla SOC
Provides: Rate Limiting, Input Validation, SQL Injection Protection, Brute Force Protection
"""
import re
import time
import logging
from typing import Optional
from datetime import datetime, timedelta
from collections import defaultdict
from functools import wraps
from fastapi import HTTPException, Request, Depends
from fastapi.security import OAuth2PasswordBearer
from starlette.middleware.base import BaseHTTPMiddleware
from app.logger import logger

# ============================================================================
# RATE LIMITING & BRUTE FORCE PROTECTION
# ============================================================================

class RateLimiter:
    """Rate limiter with IP-based and user-based blocking"""
    
    def __init__(self):
        self.requests: dict[str, list[float]] = defaultdict(list)
        self.blocked_ips: dict[str, datetime] = {}
        self.failed_logins: dict[str, int] = defaultdict(int)
        self.blocked_users: dict[str, datetime] = {}
        
    def is_ip_blocked(self, ip: str) -> bool:
        """Check if IP is temporarily blocked"""
        if ip in self.blocked_ips:
            if datetime.now() < self.blocked_ips[ip]:
                return True
            else:
                del self.blocked_ips[ip]
        return False
    
    def is_user_blocked(self, username: str) -> bool:
        """Check if username is blocked due to failed attempts"""
        if username in self.blocked_users:
            if datetime.now() < self.blocked_users[username]:
                return True
            else:
                del self.blocked_users[username]
        return False
    
    def record_request(self, ip: str) -> bool:
        """Record request and return True if allowed, False if rate limited"""
        now = time.time()
        window = 60  # 1 minute window
        
        # Clean old requests
        self.requests[ip] = [t for t in self.requests[ip] if now - t < window]
        
        # Check rate limit (60 requests per minute)
        if len(self.requests[ip]) >= 60:
            self.blocked_ips[ip] = datetime.now() + timedelta(minutes=5)
            logger.warning(f"Rate limit exceeded for IP: {ip}")
            return False
        
        self.requests[ip].append(now)
        return True
    
    def record_failed_login(self, username: str, ip: str):
        """Record failed login attempt"""
        self.failed_logins[username] += 1
        logger.warning(f"Failed login attempt #{self.failed_logins[username]} for user: {username} from IP: {ip}")
        
        # Admin specific alert
        if username == "admin" and self.failed_logins[username] >= 3:
            logger.critical(f"SECURITY ALERT: Potential brute force against ADMIN account from IP: {ip}")
            
        # Exponential backoff: 5 attempts = 15m, 10 attempts = 1h, 15 attempts = 24h
        if self.failed_logins[username] >= 15:
            self.blocked_users[username] = datetime.now() + timedelta(hours=24)
            logger.critical(f"User {username} blocked for 24 hours due to 15+ failed login attempts")
        elif self.failed_logins[username] >= 10:
            self.blocked_users[username] = datetime.now() + timedelta(hours=1)
            logger.critical(f"User {username} blocked for 1 hour due to 10+ failed login attempts")
        elif self.failed_logins[username] >= 5:
            self.blocked_users[username] = datetime.now() + timedelta(minutes=15)
            logger.critical(f"User {username} blocked for 15 minutes due to failed login attempts")
    
    def record_successful_login(self, username: str):
        """Reset failed login counter on success"""
        self.failed_logins[username] = 0

# Global rate limiter instance
rate_limiter = RateLimiter()

def rate_limit_middleware(request: Request, call_next):
    """Middleware to enforce rate limiting"""
    ip = request.client.host if request.client else "unknown"
    
    # Skip rate limit for health checks
    if request.url.path in ["/health", "/docs", "/openapi.json", "/api/auth/login"]:
        return call_next(request)
    
    if rate_limiter.is_ip_blocked(ip):
        raise HTTPException(429, "Too many requests. Please try again later.")
    
    if not rate_limiter.record_request(ip):
        raise HTTPException(429, "Rate limit exceeded. You have been temporarily blocked.")
    
    return call_next(request)


# ============================================================================
# INPUT VALIDATION & SANITIZATION
# ============================================================================

class InputValidator:
    """Comprehensive input validation and sanitization"""
    
    # Dangerous patterns for SQL injection
    SQL_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION)\b)",
        r"(--|\#|\/\*|\*\/)",
        r"(\bOR\b.*\b=\b|\bAND\b.*\b=\b)",
        r"('|(\\;)|(\%27)|(\%23))",
        r"(0x[0-9a-fA-F]+)",
    ]
    
    # XSS patterns
    XSS_PATTERNS = [
        r"(<script|</script|javascript:)",
        r"(onerror|onload|onclick|onmouse)",
        r"(<iframe|<object|<embed)",
        r"(eval\(|expression\()",
    ]
    
    # Command injection patterns
    CMD_PATTERNS = [
        r"(;|\||\`|\$|\||&&|\|\|)",
        r"(rm\s|rmdir\s|del\s|format\s)",
        r"(wget|curl|nc|netcat)",
    ]
    
    @classmethod
    def sanitize_string(cls, value: str, field_name: str = "field") -> str:
        """Sanitize string input"""
        if not value:
            return value
        
        # Remove null bytes
        value = value.replace('\x00', '')
        
        # Check for SQL injection patterns
        for pattern in cls.SQL_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning(f"SQL injection attempt detected in {field_name}: {value[:50]}")
                raise HTTPException(400, f"Invalid input in {field_name}")
        
        # Check for XSS patterns
        for pattern in cls.XSS_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning(f"XSS attempt detected in {field_name}: {value[:50]}")
                raise HTTPException(400, f"Invalid input in {field_name}")
        
        # Check for command injection
        for pattern in cls.CMD_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning(f"Command injection attempt detected in {field_name}: {value[:50]}")
                raise HTTPException(400, f"Invalid input in {field_name}")
        
        # Trim and limit length
        value = value.strip()[:500]
        
        return value
    
    @classmethod
    def validate_username(cls, username: str) -> str:
        """Validate username format"""
        if not username:
            raise HTTPException(400, "Username is required")
        
        username = username.lower().strip()
        
        # Check length
        if len(username) < 3 or len(username) > 50:
            raise HTTPException(400, "Username must be 3-50 characters")
        
        # Only allow alphanumeric and underscore
        if not re.match(r'^[a-z0-9_]+$', username):
            raise HTTPException(400, "Username can only contain letters, numbers, and underscores")
        
        return username
    
    @classmethod
    def validate_password(cls, password: str) -> str:
        """Validate password strength"""
        if not password:
            raise HTTPException(400, "Password is required")
        
        if len(password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        
        if len(password) > 128:
            raise HTTPException(400, "Password is too long")
        
        # Check for complexity
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
        
        if not (has_upper and has_lower and has_digit):
            raise HTTPException(400, "Password must contain uppercase, lowercase, and numbers")
        
        # Check for common passwords
        common_passwords = [
            "password", "123456", "qwerty", "admin", "letmein",
            "welcome", "monkey", "dragon", "master", "login"
        ]
        
        if password.lower() in common_passwords:
            raise HTTPException(400, "Password is too common. Choose a stronger password")
        
        return password
    
    @classmethod
    def validate_email(cls, email: Optional[str]) -> Optional[str]:
        """Validate email format"""
        if not email:
            return None
        
        email = email.lower().strip()
        
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(pattern, email):
            raise HTTPException(400, "Invalid email format")
        
        return email[:100]
    
    @classmethod
    def validate_ip(cls, ip: str) -> str:
        """Validate IP address format"""
        pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
        if not re.match(pattern, ip):
            raise HTTPException(400, "Invalid IP address format")
        return ip
    
    @classmethod
    def validate_severity(cls, severity: str) -> str:
        """Validate severity level"""
        valid = ["critical", "high", "medium", "low", "info"]
        severity = severity.lower().strip()
        if severity not in valid:
            raise HTTPException(400, f"Severity must be one of: {', '.join(valid)}")
        return severity
    
    @classmethod
    def validate_status(cls, status: str) -> str:
        """Validate status value"""
        valid = ["open", "in_progress", "escalated", "resolved", "closed"]
        status = status.lower().strip()
        if status not in valid:
            raise HTTPException(400, f"Status must be one of: {', '.join(valid)}")
        return status


# ============================================================================
# SECURITY MIDDLEWARE
# ============================================================================

class SecurityMiddleware(BaseHTTPMiddleware):
    """Comprehensive security middleware"""
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        client_ip = request.client.host if request.client else "unknown"
        
        # Get forwarded header if behind proxy
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        
        # --- CSRF Protection (Double-Submit Cookie Pattern) ---
        import secrets
        
        csrf_token = request.cookies.get("csrf_token")
        if not csrf_token:
            csrf_token = secrets.token_urlsafe(32)
            
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            # Bypass CSRF for login, as it's the entry point and doesn't rely on existing auth
            if request.url.path not in ["/api/auth/login"]:
                header_csrf = request.headers.get("x-csrf-token")
                if not header_csrf or header_csrf != csrf_token:
                    # In a real scenario we'd return a 403 Response directly,
                    # but with BaseHTTPMiddleware we can return a JSONResponse
                    from fastapi.responses import JSONResponse
                    return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})
        
        # Generate a nonce for this request
        csp_nonce = secrets.token_urlsafe(16)
        request.state.csp_nonce = csp_nonce
        
        # Add security headers
        response = await call_next(request)
        
        # Set CSRF cookie so frontend can read it (must NOT be httponly)
        response.set_cookie(
            key="csrf_token",
            value=csrf_token,
            httponly=False,
            secure=True,
            samesite="strict"
        )
        
        # Additional security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Content-Security-Policy"] = f"default-src 'self'; script-src 'self' 'nonce-{csp_nonce}'; style-src 'self' 'nonce-{csp_nonce}' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; object-src 'none'; base-uri 'self'; require-trusted-types-for 'script';"
        
        # Remove server identification
        if "server" in response.headers:
            del response.headers["server"]
        
        return response


# ============================================================================
# DECORATORS FOR PROTECTED ROUTES
# ============================================================================

def require_valid_input(**fields):
    """Decorator to validate input fields"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            for field_name, field_value in fields.items():
                if field_value:
                    # Determine validation type
                    if field_name == "username":
                        fields[field_name] = InputValidator.validate_username(field_value)
                    elif field_name == "password":
                        fields[field_name] = InputValidator.validate_password(field_value)
                    elif field_name == "email":
                        fields[field_name] = InputValidator.validate_email(field_value)
                    elif field_name == "severity":
                        fields[field_name] = InputValidator.validate_severity(field_value)
                    elif field_name == "status":
                        fields[field_name] = InputValidator.validate_status(field_value)
                    else:
                        fields[field_name] = InputValidator.sanitize_string(field_value, field_name)
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def check_rate_limit(ip: str):
    """Check if IP is rate limited"""
    if rate_limiter.is_ip_blocked(ip):
        raise HTTPException(429, "Too many requests. Please try again later.")


def check_user_blocked(username: str):
    """Check if user is blocked due to failed attempts"""
    if rate_limiter.is_user_blocked(username):
        raise HTTPException(423, "Account temporarily locked due to failed login attempts. Try again later.")
