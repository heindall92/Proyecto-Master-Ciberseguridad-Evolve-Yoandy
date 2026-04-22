import { createTheme } from "@mui/material/styles";

export const tacticalTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#3cff9e", // Signal Green
    },
    secondary: {
      main: "#4ae3ff", // Cyber Cyan
    },
    error: {
      main: "#ff3a3a", // Danger Red
    },
    background: {
      default: "#0a0a0f", // Deep Void
      paper: "#0f0f18",   // Panel Deep
    },
    text: {
      primary: "#e0e0e0",
      secondary: "rgba(224, 224, 224, 0.7)",
    },
  },
  typography: {
    fontFamily: "'Roboto Mono', 'Inter', monospace",
    h6: {
      letterSpacing: "2px",
      textTransform: "uppercase",
      fontWeight: 700,
    },
    subtitle2: {
      letterSpacing: "1px",
      opacity: 0.8,
    },
    body2: {
      fontSize: "0.85rem",
      lineHeight: 1.6,
    },
    button: {
      letterSpacing: "1.5px",
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 0, // Sharp tactical edges
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(60, 255, 158, 0.15)",
          boxShadow: "none",
          background: "linear-gradient(135deg, #0f0f18 0%, #0a0a0f 100%)",
          position: "relative",
          "&:before": {
            content: "''",
            position: "absolute",
            top: 0, left: 0, width: "100%", height: "2px",
            background: "linear-gradient(90deg, transparent, rgba(60, 255, 158, 0.3), transparent)",
          }
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          border: "1px solid currentColor",
          padding: "6px 20px",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            boxShadow: "0 0 10px currentColor",
            background: "rgba(60, 255, 158, 0.1)",
          },
        },
        contained: {
          background: "rgba(60, 255, 158, 0.1)",
          color: "#3cff9e",
          "&:hover": {
            background: "rgba(60, 255, 158, 0.2)",
          }
        }
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: "#0a0a0f",
          borderBottom: "1px solid rgba(74, 227, 255, 0.2)",
          boxShadow: "0 4px 10px rgba(0,0,0,0.5)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontFamily: "'Roboto Mono', monospace",
          fontSize: "10px",
          fontWeight: 700,
          height: "22px",
        },
      },
    },
  },
});
