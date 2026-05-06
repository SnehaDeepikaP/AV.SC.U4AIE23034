import React from "react";
import Head from "next/head";
import Link from "next/link";
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Slider,
  Divider,
  Button,
  Chip,
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNotifications } from "../hook/useNotifications";
import NotificationCard from "../component/NotificationCard";
import NotificationFilter from "../component/NotificationFilter";

export default function PriorityPage() {
  const {
    priorityNotifications,
    loading,
    error,
    typeFilter,
    topN,
    setTypeFilter,
    setTopN,
    markAsRead,
  } = useNotifications();

  return (
    <>
      <Head>
        <title>Priority Inbox</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Box
        sx={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #fff8e1 0%, #fce4ec 100%)",
          py: { xs: 2, md: 4 },
        }}
      >
        <Container maxWidth="md">
          {/* ── Header ── */}
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Link href="/" passHref>
              <Button startIcon={<ArrowBackIcon />} size="small" color="inherit">
                All Notifications
              </Button>
            </Link>
          </Box>

          <Box display="flex" alignItems="center" gap={2} mb={3}>
            <StarIcon sx={{ fontSize: 36, color: "warning.main" }} />
            <Box>
              <Typography variant="h4" fontWeight={700} color="warning.dark">
                Priority Inbox
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Top {topN} most important unread notifications — ranked by type and recency
              </Typography>
            </Box>
          </Box>

          {/* ── Controls ── */}
          <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }} elevation={1}>
            <Box mb={2}>
              <Typography variant="body2" fontWeight={600} gutterBottom>
                Top N (currently: {topN})
              </Typography>
              <Slider
                value={topN}
                onChange={(_e, v) => setTopN(v as number)}
                min={5}
                max={50}
                step={5}
                marks
                valueLabelDisplay="auto"
                color="warning"
                sx={{ maxWidth: 320 }}
              />
              <Box display="flex" gap={1} flexWrap="wrap" mt={1}>
                {[10, 15, 20].map((n) => (
                  <Chip
                    key={n}
                    label={`Top ${n}`}
                    onClick={() => setTopN(n)}
                    color={topN === n ? "warning" : "default"}
                    variant={topN === n ? "filled" : "outlined"}
                    size="small"
                  />
                ))}
              </Box>
            </Box>
            <Divider sx={{ my: 1.5 }} />
            <NotificationFilter value={typeFilter} onChange={setTypeFilter} />
          </Paper>

          {/* ── Priority Legend ── */}
          <Box display="flex" gap={1} mb={2} flexWrap="wrap">
            {[
              { label: "Placement — weight 3", color: "warning" },
              { label: "Result — weight 2",    color: "success" },
              { label: "Event — weight 1",      color: "primary" },
            ].map((item) => (
              <Chip
                key={item.label}
                label={item.label}
                color={item.color as "warning" | "success" | "primary"}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>

          {/* ── List ── */}
          {loading && (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress color="warning" size={40} />
            </Box>
          )}

          {error && !loading && (
            <Alert severity="error">{error}</Alert>
          )}

          {!loading && !error && priorityNotifications.length === 0 && (
            <Alert severity="success">
              No unread notifications — your inbox is clear! 🎉
            </Alert>
          )}

          {!loading &&
            priorityNotifications.map((n) => (
              <NotificationCard
                key={n.ID}
                notification={n}
                onMarkRead={markAsRead}
                showPriorityBadge
              />
            ))}
        </Container>
      </Box>
    </>
  );
}
