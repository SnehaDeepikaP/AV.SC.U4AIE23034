import React from "react";
import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
} from "@mui/material";
import { NotificationType } from "../../types";

interface Props {
  value: NotificationType | "";
  onChange: (type: NotificationType | "") => void;
}

const FILTER_OPTIONS: Array<{ label: string; value: NotificationType | "" }> = [
  { label: "All",       value: "" },
  { label: "Event",     value: "Event" },
  { label: "Result",    value: "Result" },
  { label: "Placement", value: "Placement" },
];

export default function NotificationFilter({ value, onChange }: Props) {
  return (
    <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
      <Typography variant="body2" color="text.secondary" fontWeight={600}>
        Filter by type:
      </Typography>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_e, newVal) => {
          if (newVal !== null) onChange(newVal as NotificationType | "");
        }}
        size="small"
      >
        {FILTER_OPTIONS.map((opt) => (
          <ToggleButton key={opt.value || "all"} value={opt.value}>
            {opt.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}
