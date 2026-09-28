// The app root: antd's ConfigProvider (theme, CSP nonce, locale) and antd's App (which gives
// App.useApp() its message/modal with that context). The pages arrive with SRV-32 on; until then
// a placeholder shows the theme.
import { App as AntApp, Button, ConfigProvider, Segmented, Space, Table } from 'antd';
import enGB from 'antd/locale/en_GB';
import { antdTheme } from './theme/antdTheme.js';
import { t } from './strings.js';

const ROWS = [
  { key: 'DEV00001', machine: 'Bay 02 · DEV00001', revenue: '₹1,705' },
  { key: 'SHC816DJ', machine: 'Bay 3 · SHC816DJ', revenue: '₹575' },
];

function Placeholder() {
  return (
    <main className="placeholder">
      <div className="overline">{t('placeholder.overline')}</div>
      <h1 className="page-title">{t('app.name')}</h1>
      <p>{t('placeholder.body')}</p>
      <Space wrap>
        <Button type="primary">{t('placeholder.primary')}</Button>
        <Segmented options={[t('period.day'), t('period.week'), t('period.month')]} />
      </Space>
      <Table
        size="small"
        pagination={false}
        dataSource={ROWS}
        columns={[
          { title: t('placeholder.col.machine'), dataIndex: 'machine' },
          { title: t('placeholder.col.revenue'), dataIndex: 'revenue', align: 'right' },
        ]}
      />
    </main>
  );
}

export function App({ nonce }) {
  return (
    <ConfigProvider theme={antdTheme} csp={nonce ? { nonce } : undefined} locale={enGB}>
      <AntApp>
        <Placeholder />
      </AntApp>
    </ConfigProvider>
  );
}
