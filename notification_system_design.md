# Stage 1
---

### Endpoints

---
#### 1. GET /api/v1/notifications
**Response — 200 OK**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
        "type": "Result",
        "message": "mid-sem",
        "timestamp": "2026-04-22T17:51:30Z",
        "isRead": false
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```
**Response — 401 Unauthorized**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authorization token."
  }
}
```

#### 2. GET /api/v1/notifications/unread
**Response — 200 OK**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0",
        "type": "Placement",
        "message": "CSX Corporation hiring",
        "timestamp": "2026-04-22T17:51:18Z",
        "isRead": false
      }
    ],
    "unreadCount": 42,
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3
    }
  }
}
```
#### 3. PATCH /api/v1/notifications/:id/read
**Request Body**
```json
{
  "isRead": true
}
```
**Response — 200 OK**
```json
{
  "success": true,
  "data": {
    "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
    "isRead": true,
    "updatedAt": "2026-04-22T18:00:00Z"
  }
}
```
**Response — 404 Not Found**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Notification with ID 'd146095a...' not found."
  }
}
```

#### 4. POST /api/v1/notifications/mark-all-read
**Response — 200 OK**

```json
{
  "success": true,
  "data": {
    "updatedCount": 42,
    "message": "All notifications marked as read."
  }
}
```


### JSON Schemas

#### Notification Object

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "Notification",
  "required": ["id", "type", "message", "timestamp", "isRead"],
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique identifier for the notification"
    },
    "type": {
      "type": "string",
      "enum": ["Event", "Result", "Placement"],
      "description": "Category of the notification"
    },
    "message": {
      "type": "string",
      "description": "Human-readable notification content"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp of when the notification was created"
    },
    "isRead": {
      "type": "boolean",
      "description": "Whether the notification has been read by the user"
    }
  }
}
```

#### Real-Time Notification Push (WebSocket / SSE)

For real-time delivery, the server emits a `notification.new` event over **Server-Sent Events (SSE)**:

**Endpoint:** `GET /api/v1/notifications/stream`

```
Authorization: Bearer <access_token>
Accept: text/event-stream
```

**Event payload:**

```
event: notification.new
data: {"id":"...", "type":"Placement", "message":"TCS hiring", "timestamp":"2026-04-22T18:00:00Z", "isRead":false}
```

The client connects once and keeps the connection open. On reconnect, the client sends `Last-Event-ID` header and the server replays missed events.


# Stage 2

## Database Design & Storage

### Database Choice: PostgreSQL

**Rationale:**

PostgreSQL is chosen for the following reasons:

1. **ACID compliance** — Notifications and read-states require strong consistency. Marking 50,000 notifications atomically must not result in partial updates.
2. **Rich query support** — Filtering by `notification_type`, ordering by `timestamp`, and pagination with `LIMIT/OFFSET` or cursor-based pagination are all first-class SQL operations.
3. **UUID support** — Native `uuid` type avoids string overhead and guarantees index efficiency.
4. **JSONB** — If notification `metadata` varies by type (e.g., placement company details vs. event location), a `metadata JSONB` column allows flexible schema-per-type without extra tables.
5. **Mature ecosystem** — Indexing strategies (B-Tree, partial indexes), connection pooling via PgBouncer, and read replicas are production-tested.

---

### DB Schema

```sql
-- Students table
CREATE TABLE students (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_no     VARCHAR(20)  NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Notification types enum
CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

-- Notifications table (append-only, source of truth)
CREATE TABLE notifications (
    id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    type        notification_type NOT NULL,
    message     TEXT              NOT NULL,
    metadata    JSONB,
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Per-student read tracking (separate table for scalability)
CREATE TABLE student_notifications (
    student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    notification_id UUID        NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (student_id, notification_id)
);
```

---

### Indexes

```sql
-- Speed up unread queries per student
CREATE INDEX idx_sn_student_unread
    ON student_notifications (student_id, is_read)
    WHERE is_read = FALSE;

-- Speed up type-filtered queries
CREATE INDEX idx_notifications_type
    ON notifications (type);

-- Speed up chronological ordering
CREATE INDEX idx_notifications_created_at
    ON notifications (created_at DESC);

-- Composite for paginated, filtered unread queries
CREATE INDEX idx_sn_student_type
    ON student_notifications (student_id)
    INCLUDE (notification_id, is_read);
```

---

### REST API → SQL Queries

#### GET /api/v1/notifications (all, paginated, optional type filter)

```sql
SELECT
    n.id,
    n.type,
    n.message,
    n.created_at AS timestamp,
    sn.is_read   AS "isRead"
FROM notifications n
JOIN student_notifications sn
    ON n.id = sn.notification_id
WHERE sn.student_id = $1            -- :studentId (UUID)
  AND ($2::notification_type IS NULL OR n.type = $2)  -- optional type filter
ORDER BY n.created_at DESC
LIMIT  $3                           -- :limit  (e.g., 20)
OFFSET $4;                          -- :offset (page - 1) * limit
```

#### GET /api/v1/notifications/unread

```sql
SELECT
    n.id,
    n.type,
    n.message,
    n.created_at AS timestamp
FROM notifications n
JOIN student_notifications sn
    ON n.id = sn.notification_id
WHERE sn.student_id = $1
  AND sn.is_read = FALSE
  AND ($2::notification_type IS NULL OR n.type = $2)
ORDER BY n.created_at DESC
LIMIT  $3
OFFSET $4;
```

#### PATCH /api/v1/notifications/:id/read

```sql
UPDATE student_notifications
SET
    is_read = TRUE,
    read_at = NOW()
WHERE student_id      = $1   -- :studentId
  AND notification_id = $2   -- :notificationId
RETURNING notification_id AS id, is_read AS "isRead", read_at AS "updatedAt";
```

#### POST /api/v1/notifications/mark-all-read

```sql
UPDATE student_notifications
SET
    is_read = TRUE,
    read_at = NOW()
WHERE student_id = $1
  AND is_read    = FALSE;
```

---

### Scalability Concerns at 50,000 Students × 5,000,000 Notifications

| Problem | Impact | Solution |
|---------|--------|----------|
| `student_notifications` grows to 250 billion rows if every student gets every notification | Disk, query time | **Fanout on read**: store notifications once; generate per-student rows lazily on first access or via a materialized view |
| `OFFSET`-based pagination slows as page number grows | O(offset) scans | **Cursor pagination**: use `created_at + id` as cursor instead of OFFSET |
| Single writer bottleneck | Write throughput for mass notify | **Queue-based writes**: Kafka/Bull queue; workers batch-insert into DB |
| Hot index on `student_id` for large students | Index bloat | **Partitioning** `student_notifications` by `student_id` hash range |
| Full table read for unread count | Expensive COUNT(*) | **Materialized counter** in a `student_stats` table, decremented/incremented on update |

---

---
