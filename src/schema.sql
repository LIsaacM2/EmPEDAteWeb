-- Esquema inicial para una base de datos nueva de EmPEDAte.
BEGIN;

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(50) NOT NULL UNIQUE,
  avatar_url text,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE challenges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category varchar(50) NOT NULL,
  content text NOT NULL,
  intensity_level integer DEFAULT 1,
  duration_type varchar(20) DEFAULT 'normal',
  duration_value integer DEFAULT 0
);

CREATE TABLE game_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code varchar(10) NOT NULL UNIQUE,
  status varchar(20) DEFAULT 'waiting',
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE session_players (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id bigint REFERENCES game_sessions(id) ON DELETE CASCADE,
  user_id bigint REFERENCES users(id) ON DELETE CASCADE,
  score integer DEFAULT 0,
  is_host boolean DEFAULT false,
  joined_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
