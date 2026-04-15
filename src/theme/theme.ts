'use client';

import { createTheme } from '@mui/material/styles';

const mint = '#E8F3EB';
const mintBorder = '#D4E5DA';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1A1A1A',
      light: '#4A4A4A',
      dark: '#000000',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#C0C0C0',
      light: '#E8E8E8',
      dark: '#8E8E8E',
      contrastText: '#1A1A1A',
    },
    background: {
      default: mint,
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#5C6B62',
    },
    divider: mintBorder,
    success: {
      main: '#2E7D5A',
      light: '#4CAF7A',
      dark: '#1B5E3E',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#E53935',
    },
    warning: {
      main: '#FF9800',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '1.5rem',
      fontWeight: 700,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.125rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 20,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: mint,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          padding: '10px 24px',
          fontSize: '0.9375rem',
        },
      },
      variants: [
        {
          props: { variant: 'contained', color: 'primary' },
          style: {
            background: '#1A1A1A',
            '&:hover': {
              background: '#333333',
            },
          },
        },
        {
          props: { variant: 'outlined' },
          style: {
            borderColor: mintBorder,
            '&:hover': {
              borderColor: '#1A1A1A',
              backgroundColor: 'rgba(0,0,0,0.03)',
            },
          },
        },
      ],
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 28,
          boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
          border: `1px solid ${mintBorder}`,
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          color: '#1A1A1A',
          boxShadow: 'none',
          backgroundImage: 'none',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 9999,
          },
        },
      },
    },
  },
});

export default theme;
