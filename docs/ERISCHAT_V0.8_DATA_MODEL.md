# ErisChat v0.8 — Backend-ready data model

Bu doküman prototipteki localStorage modellerini gerçek backend'e taşımak için kanonik veri sözleşmesidir.

## Kimlik

- `users.id` UUID primary key
- `users.public_id` benzersiz anonim ErisChat kimliği (`eris_48291` benzeri)
- `profiles.nickname` herkese açık takma ad
- Telefon/e-posta gibi özel alanlar public profile dahil edilmez.

## Çekirdek tablolar

### users
- id UUID PK
- public_id VARCHAR(32) UNIQUE NOT NULL
- status VARCHAR(20) DEFAULT 'online'
- created_at TIMESTAMP
- updated_at TIMESTAMP

### profiles
- user_id UUID PK/FK users.id
- nickname VARCHAR(18) NOT NULL
- avatar VARCHAR(16) NOT NULL
- bio VARCHAR(160)
- level INT DEFAULT 1
- xp INT DEFAULT 0

### follows
- follower_id UUID
- following_id UUID
- created_at TIMESTAMP
- PK `(follower_id, following_id)`

### friendships
- requester_id UUID
- addressee_id UUID
- status VARCHAR(16): pending/accepted/rejected/blocked
- created_at TIMESTAMP
- updated_at TIMESTAMP

### blocks
- blocker_id UUID
- blocked_id UUID
- created_at TIMESTAMP
- PK `(blocker_id, blocked_id)`

## Mesajlaşma

### conversations
- id UUID PK
- type VARCHAR(12): dm/group
- created_at TIMESTAMP

### conversation_members
- conversation_id UUID
- user_id UUID
- joined_at TIMESTAMP
- last_read_at TIMESTAMP
- PK `(conversation_id, user_id)`

### messages
- id UUID PK
- conversation_id UUID
- sender_id UUID
- body TEXT
- created_at TIMESTAMP
- edited_at TIMESTAMP NULL
- deleted_at TIMESTAMP NULL

## Odalar

### rooms
- id UUID PK
- owner_id UUID
- name VARCHAR(40)
- category VARCHAR(20)
- avatar VARCHAR(16)
- is_live BOOLEAN DEFAULT true
- slow_mode_seconds INT DEFAULT 0
- created_at TIMESTAMP

### room_members
- room_id UUID
- user_id UUID
- role VARCHAR(16): owner/moderator/speaker/listener
- muted_until TIMESTAMP NULL
- banned_until TIMESTAMP NULL
- joined_at TIMESTAMP
- PK `(room_id, user_id)`

### room_messages
- id UUID PK
- room_id UUID
- sender_id UUID
- body TEXT
- created_at TIMESTAMP

## Topluluklar

### communities
- id UUID PK
- owner_id UUID
- name VARCHAR(35)
- category VARCHAR(20)
- description VARCHAR(300)
- created_at TIMESTAMP

### community_members
- community_id UUID
- user_id UUID
- role VARCHAR(16): owner/moderator/member
- joined_at TIMESTAMP
- PK `(community_id, user_id)`

## Ekonomi

### wallets
- user_id UUID PK
- coin_balance BIGINT DEFAULT 0
- updated_at TIMESTAMP

### wallet_transactions
- id UUID PK
- user_id UUID
- amount BIGINT
- type VARCHAR(24)
- reference_id UUID NULL
- created_at TIMESTAMP

### gifts
- id UUID PK
- code VARCHAR(32) UNIQUE
- name VARCHAR(40)
- emoji VARCHAR(8)
- price BIGINT
- active BOOLEAN DEFAULT true

### gift_transactions
- id UUID PK
- sender_id UUID
- receiver_id UUID
- room_id UUID NULL
- gift_id UUID
- quantity INT
- total_cost BIGINT
- created_at TIMESTAMP

## Bildirimler

### notifications
- id UUID PK
- user_id UUID
- type VARCHAR(32)
- actor_id UUID NULL
- reference_id UUID NULL
- payload JSONB
- read_at TIMESTAMP NULL
- created_at TIMESTAMP

## Moderasyon

### reports
- id UUID PK
- reporter_id UUID
- target_user_id UUID NULL
- target_room_id UUID NULL
- target_message_id UUID NULL
- reason VARCHAR(40)
- details VARCHAR(500)
- status VARCHAR(20): open/reviewing/resolved/rejected
- created_at TIMESTAMP

### moderation_actions
- id UUID PK
- moderator_id UUID
- target_user_id UUID NULL
- target_room_id UUID NULL
- action VARCHAR(32)
- reason VARCHAR(500)
- expires_at TIMESTAMP NULL
- created_at TIMESTAMP

## API başlangıç sözleşmesi

`POST /v1/auth/anonymous`
`GET /v1/me`
`PATCH /v1/me/profile`
`GET /v1/discover`
`POST /v1/follows/{userId}`
`POST /v1/friend-requests/{userId}`
`POST /v1/friend-requests/{requestId}/accept`
`GET /v1/notifications`
`POST /v1/notifications/read-all`
`GET /v1/conversations`
`GET /v1/conversations/{id}/messages`
`POST /v1/conversations/{id}/messages`
`GET /v1/rooms`
`POST /v1/rooms`
`POST /v1/rooms/{id}/join`
`POST /v1/rooms/{id}/moderation`
`GET /v1/communities`
`POST /v1/communities`
`POST /v1/communities/{id}/join`
`GET /v1/wallet`
`POST /v1/gifts/send`
`POST /v1/reports`

## WebSocket olayları

`message.created`, `message.read`, `typing.started`, `typing.stopped`, `room.member_joined`, `room.member_left`, `room.role_changed`, `room.hand_raised`, `room.moderation_changed`, `notification.created`

Bu sözleşme UI prototipindeki localStorage isimlerinden bağımsız gerçek sunucu modelinin temelidir.
