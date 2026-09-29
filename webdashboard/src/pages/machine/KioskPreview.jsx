// A kiosk-like look at a config (dashboard plan §5.6.2): the header the machine shows (logo text,
// name, location), the drinks in menu order with price, badge and hopper, sold out greyed, and the
// disabled ones hidden, as the kiosk does. Dark, like the kiosk, from the palette's tokens.
import { Money } from '../../ui/Money.jsx';
import { t } from '../../strings.js';
import styles from './config.module.css';

export function KioskPreview({ config }) {
  const tenant = config.tenant ?? {};
  const flavors = (config.flavors ?? []).filter((f) => f.enabled !== false);
  return (
    <figure className={styles.kiosk} aria-label={t('config.preview')}>
      <div className={styles.kioskHead}>
        {tenant.logo_text && <span className={styles.logo}>{tenant.logo_text}</span>}
        <span>
          <b className={styles.kioskName}>{tenant.display_name}</b>
          {tenant.location_label && <span className={styles.kioskLocation}>{tenant.location_label}</span>}
        </span>
      </div>
      <ol className={styles.flavors}>
        {flavors.map((f) => {
          const offer = f.offer_price ?? null;
          return (
            <li key={f.id} className={`${styles.flavor} ${f.sold_out ? styles.soldOut : ''}`}>
              <div className={styles.flavorTop}>
                <span className={styles.hopper}>{t('config.hopper', { n: f.hopper })}</span>
                {f.badge && <span className={styles.badge}>{f.badge}</span>}
              </div>
              <b className={styles.flavorName}>{f.name}</b>
              <span className={styles.flavorPrice}>
                <Money value={offer ?? f.actual_price} was={offer !== null && offer !== f.actual_price ? f.actual_price : undefined} />
              </span>
              {f.sold_out && <span className={styles.soldOutLabel}>{t('config.soldOut')}</span>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
