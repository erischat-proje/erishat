-- ErisChat core schema; extended social tables can be migrated separately.
CREATE TABLE IF NOT EXISTS users (
  id varchar(64) PRIMARY KEY,
  public_id varchar(32) UNIQUE NOT NULL,
  nickname varchar(32) NOT NULL,
  avatar varchar(16) NOT NULL DEFAULT '🦊',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversations (
  id varchar(128) PRIMARY KEY,
  type varchar(12) NOT NULL DEFAULT 'dm' CHECK (type IN ('dm','group')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversation_members (
  id serial PRIMARY KEY,
  conversation_id varchar(128) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversation_member UNIQUE (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  conversation_id varchar(128) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id varchar(64) NOT NULL REFERENCES users(id),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at ASC);
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash varchar(128) PRIMARY KEY,
  user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
