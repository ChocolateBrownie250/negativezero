import { ExternalLink } from 'lucide-react';
import Modal from './Modal';
import { COLORS, LABEL_PRIMARY, LABEL_SECONDARY, RING_STRONG } from '../../lib/colors';
import { externalLinkHref, hostFromUrl } from '../../lib/platform';

interface Props {
  items: Array<{ name: string; url: string }>;
  onClose: () => void;
}

export default function OpenLinksModal({ items, onClose }: Props) {
  return (
    <Modal
      title={`Open ${items.length} bookmark${items.length === 1 ? '' : 's'}`}
      onClose={onClose}
      maxWidth={420}
    >
      <p className="text-[13px] mb-3" style={{ color: LABEL_SECONDARY }}>
        Safari can only open one tab per tap. Tap each link below to open it.
      </p>
      <div
        className="rounded-xl overflow-y-auto"
        style={{ maxHeight: '60vh', background: COLORS.surface }}
      >
        {items.map(({ name, url }, i) => {
          // Defense-in-depth: don't render a non-http(s) URL as a live link.
          const href = externalLinkHref(url);
          if (!href) return null;
          return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 no-underline"
            style={{
              borderTop: i > 0 ? `1px solid ${RING_STRONG}` : undefined,
              color: LABEL_PRIMARY,
            }}
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${hostFromUrl(url)}&sz=32`}
              alt=""
              width={16}
              height={16}
              className="rounded-sm shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-medium truncate">{name}</div>
              <div className="text-[12px] truncate" style={{ color: LABEL_SECONDARY }}>
                {hostFromUrl(url)}
              </div>
            </div>
            <ExternalLink size={14} style={{ color: LABEL_SECONDARY, flexShrink: 0 }} />
          </a>
          );
        })}
      </div>
    </Modal>
  );
}
