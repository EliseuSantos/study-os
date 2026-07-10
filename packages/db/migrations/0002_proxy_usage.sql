CREATE TABLE proxy_usage (
  service TEXT NOT NULL, period TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (service, period)
);
