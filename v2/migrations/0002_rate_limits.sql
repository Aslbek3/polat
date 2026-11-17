-- 0002_rate_limits — urinishlar cheklovi bazada (eski tizimda xotirada edi:
-- PM2 restart bo'lganda hisoblagich nolga tushardi, brute-force himoyasi
-- "tozalanib" qolardi).
CREATE TABLE rate_limit_hits (
  key         TEXT        PRIMARY KEY,           -- masalan 'login:ip:1.2.3.4'
  count       INTEGER     NOT NULL CHECK (count >= 0),
  reset_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_rate_limit_hits_reset ON rate_limit_hits (reset_at);
