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

