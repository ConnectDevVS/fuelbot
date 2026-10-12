// A form for tests: renders fields by name and hands the antd form instance back.
import { Form, Input } from 'antd';

export function FormHarness({ names, onForm, children, initialValues }) {
  const [form] = Form.useForm();
  onForm(form);
  return (
    <Form form={form} initialValues={initialValues}>
      {names.map((name) => (
        <Form.Item key={JSON.stringify(name)} name={name} label={[].concat(name).join('.')}><Input /></Form.Item>
      ))}
      {children}
    </Form>
  );
}
