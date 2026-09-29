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
    // antd derives the status fills from our dark status colours, which gives muddy chips and
    // banners: every status Bg/Border comes from the palette instead.
    colorSuccess: palette.ok,
    colorSuccessBg: palette.okSurface,
    colorSuccessBorder: palette.okBorder,
    colorWarning: palette.warn,
    colorWarningBg: palette.warnSurface,
    colorWarningBorder: palette.warnBorder,
    colorError: palette.bad,
    colorErrorBg: palette.badSurface,
    colorErrorBorder: palette.badBorder,
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
      // Default buttons would take the lime (Button's colorPrimary) as hover / focus / active text
      // and border: lime text on white (seen on "Generate" in SRV-46). The readable green instead.
      defaultHoverColor: palette.primary,
      defaultHoverBorderColor: palette.primary,
      defaultActiveColor: palette.link,
      defaultActiveBorderColor: palette.link,
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
