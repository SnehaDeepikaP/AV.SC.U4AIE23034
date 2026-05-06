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
# Stage 3

## Query Analysis & Optimization

### Original Query

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

### Is This Query Accurate?

**No — the query has several problems:**

1. **Wrong table structure** — Based on the schema designed in Stage 2, per-student read state lives in `student_notifications`, not `notifications`. The `notifications` table has no `studentID` or `isRead` column.

2. **Incorrect column names** — The columns should be `student_id` (UUID, not integer `1042`), `is_read`, and `created_at` using snake_case.

3. **`SELECT *` is harmful** — Fetches all columns (including `metadata JSONB`) even when only `id`, `type`, `message`, `timestamp`, and `is_read` are needed, increasing memory and I/O.

4. **`ORDER BY createdAt ASC`** — Fetching oldest-first means the user sees stale notifications first. Descending order (`DESC`) is the correct UX default.

### Why Is It Slow?

At 50,000 students and 5,000,000 notifications:
- No index on `(student_id, is_read)` → full table scan of `student_notifications`.
- `ORDER BY created_at ASC` without an index forces an in-memory sort of millions of rows.
- `SELECT *` causes wide row fetches, bloating the query buffer.

**Estimated computation cost without indexes:** O(N) where N = total rows in `student_notifications` ≈ tens of millions. Each query would take several seconds.

### Should You Add Indexes on Every Column?

**No.** Adding indexes on every column is harmful:

- Every `INSERT`, `UPDATE`, and `DELETE` must also update all indexes, dramatically slowing writes.
- For a mass-notify of 50,000 students, write throughput would collapse.
- Indexes consume significant disk space.
- The query planner may choose a suboptimal index if too many exist, leading to worse performance than no index at all.

**The right approach** is to add targeted indexes only on columns that appear in `WHERE`, `JOIN ON`, and `ORDER BY` clauses of high-frequency queries (as shown in Stage 2).

### Corrected Query

```sql
SELECT
    n.id,
    n.type,
    n.message,
    n.created_at   AS timestamp,
    sn.is_read     AS "isRead"
FROM notifications n
JOIN student_notifications sn
    ON n.id = sn.notification_id
WHERE sn.student_id = '550e8400-e29b-41d4-a716-446655440000'  -- UUID, not integer
  AND sn.is_read = FALSE
ORDER BY n.created_at DESC
LIMIT 20;
```

This query benefits from the partial index `idx_sn_student_unread` created in Stage 2:

```sql
CREATE INDEX idx_sn_student_unread
    ON student_notifications (student_id, is_read)
    WHERE is_read = FALSE;
```

### Query: Students Who Got a Placement Notification in the Last 7 Days

```sql
SELECT DISTINCT s.id, s.roll_no, s.email, s.name
FROM students s
JOIN student_notifications sn ON s.id = sn.student_id
JOIN notifications n          ON n.id  = sn.notification_id
WHERE n.type       = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days'
ORDER BY s.roll_no;
```

**Why `DISTINCT`?** A student may have received multiple placement notifications in 7 days. `DISTINCT` deduplications at the student level.

**Supporting index:**

```sql
CREATE INDEX idx_notifications_type_created
    ON notifications (type, created_at DESC);
```

---

---
# Stage 4

## Performance Strategy — Caching & Optimization

### The Problem

Notifications are fetched on every page load for every student. With 50,000 concurrent students, this is 50,000 database queries per page load cycle, overwhelming PostgreSQL.

### Recommended Strategy: Multi-Layer Caching

#### Layer 1 — Redis Cache (Primary Strategy)

Cache per-student notification lists in Redis with a TTL.

**Cache key design:**
```
notifications:{studentId}:page:{page}:limit:{limit}:type:{type|all}
```

**TTL:** 60 seconds for paginated lists; 30 seconds for unread count.

**Invalidation trigger:** When a new notification is pushed to a student, delete all their cached keys using a Redis key pattern scan or a dedicated invalidation set.

```typescript
// On read (cache-aside pattern)
const cacheKey = `notifications:${studentId}:page:${page}:limit:${limit}:type:${type}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const data = await db.query(/* SQL */);
await redis.setex(cacheKey, 60, JSON.stringify(data));
return data;
```

**Tradeoff:** Students may see notifications up to 60 s stale. Acceptable for non-critical notifications; use SSE/WebSocket for real-time delivery alongside.

#### Layer 2 — Cursor-Based Pagination (replaces OFFSET)

Replace `LIMIT/OFFSET` with cursor pagination to avoid expensive skip-scans:

```sql
-- First page
SELECT ... FROM notifications n
JOIN student_notifications sn ON n.id = sn.notification_id
WHERE sn.student_id = $1
  AND sn.is_read = FALSE
ORDER BY n.created_at DESC, n.id DESC
LIMIT 20;

-- Subsequent pages (cursor = last seen {created_at, id})
SELECT ... FROM notifications n
JOIN student_notifications sn ON n.id = sn.notification_id
WHERE sn.student_id = $1
  AND sn.is_read = FALSE
  AND (n.created_at, n.id) < ($cursor_time, $cursor_id)  -- keyset
ORDER BY n.created_at DESC, n.id DESC
LIMIT 20;
```

This is O(1) regardless of page depth vs O(N) for OFFSET.

#### Layer 3 — Materialized Unread Count

Instead of `COUNT(*)` on every request:

```sql
CREATE TABLE student_notification_stats (
    student_id   UUID PRIMARY KEY REFERENCES students(id),
    unread_count INTEGER NOT NULL DEFAULT 0
);
```

Increment on new notification, decrement on mark-as-read. The API returns `unreadCount` from this table without a COUNT query.

#### Layer 4 — Read Replica

Route all `SELECT` queries to a PostgreSQL read replica. Write queries (`UPDATE`, `INSERT`) go to the primary. This horizontally scales read capacity.

### Strategy Tradeoffs

| Strategy | Benefit | Tradeoff |
|----------|---------|----------|
| Redis cache | Near-zero DB reads for hot data | Stale data; cache invalidation complexity |
| Cursor pagination | O(1) deep pagination | Clients can't jump to arbitrary page numbers |
| Materialized count | O(1) unread count | Extra write on every notification update |
| Read replica | Scales reads horizontally | Replication lag; replica may be slightly behind |
| CDN (static assets) | Reduces FE load time | Only for static; not applicable to dynamic API |

---

---

# Stage 5

## Bulk Notify Redesign

### Original Pseudocode (Problematic)

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # real-time push
```

### Shortcomings

1. **Sequential processing** — Iterates over 50,000 students one-by-one. At even 10 ms per student, this takes 500 seconds (~8 minutes). Completely unacceptable.

2. **No error handling** — If `send_email` fails for student #200, the loop throws and all subsequent students receive nothing. The 200-student failure proves this.

3. **Tight coupling** — Email, DB, and push are synchronous dependencies. A slow email API blocks all three for every student.

4. **No idempotency** — If the server crashes midway, there is no way to know which students were already notified. Re-running sends duplicates.

5. **Memory pressure** — Passing 50,000 `student_ids` as an in-memory array can exhaust heap on large deployments.

6. **Should DB and email happen together?** — No. They are independent concerns with different failure modes. DB insert should happen atomically and immediately; email delivery is eventually consistent and can be retried.

### Redesigned Architecture

```
                     ┌────────────────────┐
                     │  HR triggers       │
                     │  POST /notify-all  │
                     └────────┬───────────┘
                              │
                    ┌─────────▼──────────┐
                    │  API Handler        │
                    │  1. Validate input  │
                    │  2. Batch-insert    │
                    │     notifications  │
                    │     into DB        │
                    │  3. Enqueue job    │
                    │     to Bull/Redis  │
                    │  4. Return 202     │
                    └─────────┬──────────┘
                              │
            ┌─────────────────▼─────────────────┐
            │         Message Queue              │
            │    (Bull + Redis / Kafka)          │
            └──────┬──────────────┬─────────────┘
                   │              │
        ┌──────────▼───┐   ┌──────▼──────────┐
        │ Email Worker  │   │ Push Worker      │
        │ (N instances) │   │ (N instances)    │
        │               │   │                  │
        │ Batch 500/job │   │ SSE / WebSocket  │
        │ Retry on fail │   │ push per student │
        │ DLQ on 3 fail │   └──────────────────┘
        └───────────────┘
```

### Revised Pseudocode

```typescript
// API Handler — synchronous part
async function notifyAll(studentIds: string[], message: string): Promise<void> {
  // 1. Bulk insert notification record once
  const notification = await db.notifications.create({ message, type: 'Placement' });

  // 2. Bulk insert student_notifications rows in batches (avoid single huge INSERT)
  const BATCH_SIZE = 1000;
  for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
    const batch = studentIds.slice(i, i + BATCH_SIZE);
    await db.studentNotifications.bulkCreate(
      batch.map(sid => ({ studentId: sid, notificationId: notification.id }))
    );
  }

  // 3. Enqueue email jobs (do NOT await; fire and forget into queue)
  await emailQueue.addBulk(
    studentIds.map(sid => ({
      name: 'send-notification-email',
      data: { studentId: sid, notificationId: notification.id, message },
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    }))
  );

  // 4. Enqueue push jobs
  await pushQueue.addBulk(
    studentIds.map(sid => ({
      name: 'push-notification',
      data: { studentId: sid, notificationId: notification.id, message }
    }))
  );
}

// Email Worker — processes jobs from queue
emailQueue.process('send-notification-email', 50 /* concurrency */, async (job) => {
  const { studentId, notificationId, message } = job.data;
  try {
    await emailService.send(studentId, message);
    await Log('backend', 'info', 'service', `Email sent to ${studentId} for notification ${notificationId}`);
  } catch (err) {
    await Log('backend', 'error', 'service', `Email failed for ${studentId}: ${err.message}`);
    throw err; // Bull retries automatically
  }
});
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| DB insert happens synchronously in the API handler | Notifications must be persisted reliably before anything else; DB is the source of truth |
| Email & push are enqueued asynchronously | Email APIs can be slow or fail; they must not block the critical path |
| Batch inserts of 1000 rows | Avoids statement timeout and memory issues with 50,000-row INSERT |
| 3 retries with exponential backoff | Transient email API failures are retried without human intervention |
| Dead-letter queue (DLQ) | Students who still fail after 3 retries are logged for manual follow-up |
| Idempotency key on notification | Re-running `notifyAll` with same notification ID skips already-sent emails |

---

---

# Stage 6

## Priority Inbox — Top-N Most Important Unread Notifications

### Problem

Display the top `n` most important unread notifications. Priority is determined by a combination of **type weight** (Placement > Result > Event) and **recency** (newer = higher priority).

### Priority Scoring Formula

```
score = typeWeight * 1_000_000 + recencyScore
```

Where:
- `typeWeight`: Placement = 3, Result = 2, Event = 1
- `recencyScore`: milliseconds since Unix epoch (newer = larger number)

This ensures a Placement notification always ranks above a Result, but among same-type notifications, the newest appears first.

### Implementation (TypeScript)

```typescript
interface Notification {
  id: string;
  type: "Event" | "Result" | "Placement";
  message: string;
  timestamp: string; // ISO 8601
  isRead: boolean;
}

const TYPE_WEIGHT: Record<Notification["type"], number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

/**
 * Compute a numeric priority score for a notification.
 * Higher score = higher priority.
 *
 * Score = typeWeight * 1_000_000_000_000 + timestampMs
 * The large multiplier ensures type always dominates recency.
 */
function priorityScore(notification: Notification): number {
  const typeWeight = TYPE_WEIGHT[notification.type];
  const timestampMs = new Date(notification.timestamp).getTime();
  return typeWeight * 1_000_000_000_000 + timestampMs;
}

/**
 * Returns the top-N unread notifications sorted by priority.
 * Uses a min-heap approach for efficiency with large datasets.
 *
 * Time Complexity:  O(N log n) where N = total notifications, n = topN
 * Space Complexity: O(n)
 */
function getTopNPriorityNotifications(
  notifications: Notification[],
  topN: number
): Notification[] {
  const unread = notifications.filter((n) => !n.isRead);

  // Min-heap: maintains the top-N highest scores
  // Element: [score, notification]
  type HeapEntry = [number, Notification];

  const heap: HeapEntry[] = [];

  const heapifyUp = (i: number) => {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (heap[parent][0] > heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };

  const heapifyDown = (i: number) => {
    const n = heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && heap[l][0] < heap[smallest][0]) smallest = l;
      if (r < n && heap[r][0] < heap[smallest][0]) smallest = r;
      if (smallest === i) break;
      [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
      i = smallest;
    }
  };

  for (const notification of unread) {
    const score = priorityScore(notification);
    if (heap.length < topN) {
      heap.push([score, notification]);
      heapifyUp(heap.length - 1);
    } else if (score > heap[0][0]) {
      heap[0] = [score, notification];
      heapifyDown(0);
    }
  }

  // Extract and sort descending by score
  return heap
    .sort((a, b) => b[0] - a[0])
    .map(([, notification]) => notification);
}
```

### Maintaining Top-N Efficiently as New Notifications Arrive

The heap approach naturally handles new notifications: each new notification is evaluated against the current minimum in the heap (O(log n) operation). If it scores higher, it replaces the minimum. This makes the system efficient even with a continuous stream of incoming notifications.

For a production implementation with SSE/WebSocket:

1. On `notification.new` event, compute the new notification's score.
2. If its score > minimum score in the current top-N display, insert it and evict the minimum.
3. Re-render the priority inbox client-side — no full re-fetch needed.

### Approach Description (for notification_system_design.md)

The Priority Inbox ranks unread notifications using a **weighted scoring system** where notification type determines primary rank (Placement outranks Result outranks Event) and recency serves as a tiebreaker. A min-heap of size N processes the full notification list in O(total × log N) time, making it efficient even with thousands of notifications. As new notifications arrive in real-time, only an O(log N) heap comparison is needed to decide whether to evict the current minimum — no full re-sort is required.
