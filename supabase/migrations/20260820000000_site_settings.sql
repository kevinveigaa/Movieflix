CREATE TABLE IF NOT EXISTS site_settings (
  "key" TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO site_settings ("key", value, updated_at)
VALUES ('series_hidden', TRUE, NOW())
ON CONFLICT ("key") DO UPDATE
SET value = TRUE, updated_at = NOW();

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read site_settings" ON site_settings;
CREATE POLICY "Allow public read site_settings"
  ON site_settings FOR SELECT
  TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Allow admin update site_settings" ON site_settings;
CREATE POLICY "Allow admin update site_settings"
  ON site_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

NOTIFY pgrst, 'reload schema';
