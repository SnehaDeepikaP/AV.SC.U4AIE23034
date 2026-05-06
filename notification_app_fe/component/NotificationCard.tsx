import React from "react";
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import MarkEmailReadIcon from "@mui/icons-material/MarkEmailRead";
import EventIcon from "@mui/icons-material/Event";
import SchoolIcon from "@mui/icons-material/School";
import WorkIcon from "@mui/icons-material/Work";
import { Notification, NotificationType } from "../../types";

interface Props {
  notification: Notification;
  onMarkRead: (id: string) => void;
  showPriorityBadge?: boolean;
}

const TYPE_COLOR: Record<NotificationType, "primary" | "success" | "warning"> = {
  Event: "primary",
  Result: "success",
  Placement: "warning",
};

const TYPE_ICON: Record<NotificationType, React.ReactNode> = {
  Event: <EventIcon fontSize="small" />,
  Result: <SchoolIcon fontSize="small" />,
  Placement: <WorkIcon fontSize="small" />,
};

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NotificationCard({
  notification,
  onMarkRead,
  showPriorityBadge = false,
}: Props) {
  const { ID, Type, Message, Timestamp, isRead } = notification;

  return (
    <Card
      elevation={isRead ? 0 : 3}
      sx={{
        mb: 1.5,
        borderLeft: isRead ? "4px solid #e0e0e0" : "4px solid",
        borderLeftColor: isRead ? "divider" : `${TYPE_COLOR[Type]}.main`,
        opacity: isRead ? 0.75 : 1,
        transition: "all 0.2s ease",
        "&:hover": { transform: "translateY(-1px)", boxShadow: 4 },
      }}
    >
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between">
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <Chip
                icon={<>{TYPE_ICON[Type]}</>}
                label={Type}
                color={TYPE_COLOR[Type]}
                size="small"
                variant={isRead ? "outlined" : "filled"}
              />
              {!isRead && (
                <Chip
                  label="New"
                  size="small"
                  color="error"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
              {showPriorityBadge && (
                <Chip
                  label="⭐ Priority"
                  size="small"
                  color="secondary"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
            </Box>
            <Typography
              variant="body1"
              fontWeight={isRead ? 400 : 600}
              sx={{ textTransform: "capitalize" }}
            >
              {Message}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTimestamp(Timestamp)}
            </Typography>
          </Box>

          {!isRead && (
            <Tooltip title="Mark as read">
              <IconButton
                size="small"
                onClick={() => onMarkRead(ID)}
                color="primary"
                sx={{ ml: 1 }}
              >
                <MarkEmailReadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
