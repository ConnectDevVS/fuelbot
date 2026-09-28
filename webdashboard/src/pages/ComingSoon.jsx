// A page that a later story builds. Refresh refetches this page's queries (here: who am I), which
// is also how a lapsed session is noticed.
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'antd';
import { t } from '../strings.js';

export default function ComingSoon({ title, story }) {
  const queryClient = useQueryClient();
  return (
    <section className="page">
      <h1 className="page-title">{title}</h1>
      <p>{t('placeholder.coming', { story })}</p>
      <Button onClick={() => queryClient.invalidateQueries()}>{t('placeholder.refresh')}</Button>
    </section>
  );
}
