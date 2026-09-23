CREATE TABLE IF NOT EXISTS user_cosmetics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id VARCHAR(64) NOT NULL,
    cosmetic_type VARCHAR(16) NOT NULL,
    asset_key VARCHAR(255) NOT NULL,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_user_cosmetic UNIQUE (user_id, cosmetic_type, asset_key)
);
CREATE INDEX IF NOT EXISTS ix_user_cosmetics_user_id ON user_cosmetics(user_id);
