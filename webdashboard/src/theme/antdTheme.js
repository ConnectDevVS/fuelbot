// Ant Design's theme from the palette (dashboard plan §2.8; checked in spike G). Primary buttons
// are lime with dark text through Button's component tokens; everything else that antd colours
// with colorPrimary gets the dark green, which is readable on white.
import { fonts, palette } from './palette.js';

export const antdTheme = {
  token: {
    colorPrimary: palette.primary,
    colorLink: palette.link,
    colorText: palette.text,
    colorTextSecondary: palette.muted,
    colorBorder: palette.border,
    colorBgLayout: palette.bg,
    colorBgContainer: palette.surface,
    colorSuccess: palette.ok,
    colorWarning: palette.warn,
    colorError: palette.bad,
    borderRadius: 10,
    borderRadiusLG: 16,
    fontFamily: fonts.sans,
    fontFamilyCode: fonts.mono,
    fontSize: 15,
  },
  components: {
    Button: {
      colorPrimary: palette.accent,
      colorPrimaryHover: palette.accentHover,
      colorPrimaryActive: palette.accentActive,
      primaryColor: palette.onAccent,
      primaryShadow: 'none',
      fontWeight: 700,
    },
    Segmented: {
      itemSelectedBg: palette.accent,
      itemSelectedColor: palette.onAccent,
    },
    Menu: {
      itemSelectedBg: palette.selected,
      itemSelectedColor: palette.text,
    },
    Layout: {
      siderBg: palette.surface,
      headerBg: palette.bg,
      bodyBg: palette.bg,
    },
  },
};
