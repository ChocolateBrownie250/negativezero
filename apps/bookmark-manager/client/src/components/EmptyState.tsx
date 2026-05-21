import { LABEL_TERTIARY } from '../lib/colors';

interface Props {
  message?: string;
}

export default function EmptyState({ message = 'Nothing here yet' }: Props) {
  return (
    <div className="py-10 text-center text-[15px]" style={{ color: LABEL_TERTIARY }}>
      {message}
    </div>
  );
}
