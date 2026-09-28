// dayjs is antd's date library. Times are shown in DISPLAY_TZ (dashboard plan §2.10), so the utc
// and timezone plugins are loaded once here; en-gb gives day-month dates and Monday-first weeks.
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/en-gb';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('en-gb');

export default dayjs;
