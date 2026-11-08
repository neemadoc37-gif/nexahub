"""Bounded production workers; never log query strings, bodies or credentials."""

bind = "0.0.0.0:5000"
workers = 2
worker_class = "gthread"
threads = 4
timeout = 45
graceful_timeout = 30
keepalive = 3
max_requests = 1000
max_requests_jitter = 50
limit_request_line = 4094
limit_request_fields = 64
limit_request_field_size = 8190
accesslog = "-"
access_log_format = '%(m)s %(U)s %(s)s'
errorlog = "-"
loglevel = "warning"
