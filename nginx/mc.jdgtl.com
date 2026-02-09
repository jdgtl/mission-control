# Mission Control — Nginx reverse proxy config
#
# Setup steps:
# 1. sudo cp /home/openclaw/mission-control/nginx/mc.jdgtl.com /etc/nginx/sites-available/
# 2. sudo ln -s /etc/nginx/sites-available/mc.jdgtl.com /etc/nginx/sites-enabled/
# 3. sudo nginx -t && sudo systemctl reload nginx
# 4. Set DNS: A record mc.jdgtl.com → 174.138.93.111
# 5. sudo certbot --nginx -d mc.jdgtl.com  (adds SSL automatically)

# Rate limiting zone for auth endpoints
limit_req_zone $binary_remote_addr zone=auth:10m rate=20r/m;

server {
    listen 80;
    server_name mc.jdgtl.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Max upload size
    client_max_body_size 10M;

    # Auth endpoint rate limiting
    location /api/auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3333;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE/streaming endpoints (chat)
    location /api/chat {
        proxy_pass http://127.0.0.1:3333;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        chunked_transfer_encoding on;
    }

    # All other routes
    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
