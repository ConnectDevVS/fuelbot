// Nav icons (SVG React components from @ant-design/icons: no fonts, fine under the CSP).
import {
  ApartmentOutlined, AppstoreOutlined, AuditOutlined, BankOutlined, DashboardOutlined, HomeOutlined, InboxOutlined,
  LineChartOutlined, MenuOutlined, QuestionCircleOutlined, RiseOutlined, ShopOutlined, TeamOutlined,
  ThunderboltOutlined, UserOutlined, WarningOutlined,
} from '@ant-design/icons';

export const ICONS = {
  fleet: DashboardOutlined,
  home: HomeOutlined,
  sales: LineChartOutlined,
  stock: InboxOutlined,
  machines: ShopOutlined,
  products: AppstoreOutlined,
  users: TeamOutlined,
  company: BankOutlined,
  tenants: ApartmentOutlined,
  faults: WarningOutlined,
  telemetry: ThunderboltOutlined,
  audit: AuditOutlined,
  unregistered: QuestionCircleOutlined,
  salesAll: RiseOutlined,
  more: MenuOutlined,
  account: UserOutlined,
};
