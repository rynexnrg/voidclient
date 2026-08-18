-- VoidClient Launcher Database
-- Migration 0002

-- ==========================================
-- USERS
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Eindeutige Minecraft UUID
    minecraft_uuid TEXT NOT NULL UNIQUE,

    -- Aktueller Minecraft Username
    username TEXT NOT NULL,

    -- Online-System
    online INTEGER NOT NULL DEFAULT 0,
    last_online INTEGER NOT NULL DEFAULT (unixepoch()),

    -- Wann der Benutzer VoidClient zum ersten Mal benutzt hat
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);

CREATE INDEX IF NOT EXISTS idx_users_online
ON users(online);


-- ==========================================
-- FRIEND REQUESTS
-- ==========================================
CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (sender_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (receiver_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CHECK (sender_id != receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver
ON friend_requests(receiver_id, status);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
ON friend_requests(sender_id, status);


-- ==========================================
-- FRIENDSHIPS
-- ==========================================
CREATE TABLE IF NOT EXISTS friendships (
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,

    friends_since INTEGER NOT NULL DEFAULT (unixepoch()),

    PRIMARY KEY (user_id, friend_id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (friend_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CHECK (user_id != friend_id)
);


-- ==========================================
-- INBOX / POSTEINGANG
-- ==========================================
CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER NOT NULL,

    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,

    is_read INTEGER NOT NULL DEFAULT 0,

    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inbox_user
ON inbox(user_id, is_read);


-- ==========================================
-- LAUNCHER NEWS / SYSTEM MESSAGES
-- ==========================================
CREATE TABLE IF NOT EXISTS launcher_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,

    active INTEGER NOT NULL DEFAULT 1,

    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_launcher_messages_active
ON launcher_messages(active);


-- ==========================================
-- OPTIONAL: BLOCKED USERS
-- ==========================================
CREATE TABLE IF NOT EXISTS blocked_users (
    user_id INTEGER NOT NULL,
    blocked_user_id INTEGER NOT NULL,

    created_at INTEGER NOT NULL DEFAULT (unixepoch()),

    PRIMARY KEY (user_id, blocked_user_id),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    FOREIGN KEY (blocked_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CHECK (user_id != blocked_user_id)
);
