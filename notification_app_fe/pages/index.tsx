import React from "react";
import Head from "next/head";
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Pagination,
  Badge,
  Tabs,
  Tab,
  Divider,
  Paper,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useNotifications } from "../hook/useNotifications";
import NotificationCard from "../component/NotificationCard";
import NotificationFilter from "../component/NotificationFilter";

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = React.useState(0); // 0=All, 1=Unread

  const {
    notifications,
    loading,
    error,
    page,
    totalPages,
    typeFilter,
    setPage,
    setTypeFilter,
    markAsRead,
  } = useNotifications();

  const unreadCount  = notifications.filter((n) => !n.isRead).length;
  const displayed    = activeTab === 1 ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <>
      <Head>
        <title>Notifications</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%)",
          py: { xs: 2, md: 4 },
        }}
      >
        <Container maxWidth="md">
          {/* ── Header ── */}
          <Box display="flex" alignItems="center" gap={2} mb={3}>
            <Badge badgeContent={unreadCount} color="error" max={99}>
              <NotificationsIcon sx={{ fontSize: 36, color: "primary.main" }} />
            </Badge>
            <Box>
              <Typography variant="h4" fontWeight={700} color="primary.dark">
                Notifications
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {unreadCount} unread &middot; {notifications.length} total
              </Typography>
            </Box>
          </Box>

          {/* ── Tabs ── */}
          <Paper sx={{ mb: 2, borderRadius: 2 }} elevation={1}>
            <Tabs
              value={activeTab}
              onChange={(_e, v) => setActiveTab(v)}
              indicatorColor="primary"
              textColor="primary"
              sx={{ px: 2 }}
            >
              <Tab label="All" />
              <Tab
                label={
                  <Badge badgeContent={unreadCount} color="error">
                    <Box pr={1.5}>Unread</Box>
                  </Badge>
                }
              />
            </Tabs>
            <Divider />
            <Box sx={{ p: 2 }}>
              <NotificationFilter value={typeFilter} onChange={(t) => { setTypeFilter(t); setPage(1); }} />
            </Box>
          </Paper>

          {/* ── Content ── */}
          {loading && (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress size={40} />
            </Box>
          )}

          {error && !loading && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!loading && !error && displayed.length === 0 && (
            <Alert severity="info">
              {activeTab === 1 ? "No unread notifications 🎉" : "No notifications found."}
            </Alert>
          )}

          {!loading &&
            displayed.map((n) => (
              <NotificationCard key={n.ID} notification={n} onMarkRead={markAsRead} />
            ))}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <Box display="flex" justifyContent="center" mt={3}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_e, p) => setPage(p)}
                color="primary"
              />
            </Box>
          )}
        </Container>
      </Box>
    </>
  );
}
